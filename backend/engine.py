"""
JobProof AI — backend/engine.py
Server-side analysis engine: a faithful port of the JavaScript engine
(js/taxonomy.js, js/jd.js, js/parse.js, js/analysis.js, js/insights.js,
js/rewrite.js). Same thresholds, same weights, same honest wording —
so the UI renders identically whether data was computed locally or here.
"""

from __future__ import annotations

import re
from datetime import datetime

# ============================================================
# Utilities (port of core.js U.*)
# ============================================================

def norm(s) -> str:
    s = "" if s is None else str(s)
    s = s.replace("\u2018", "'").replace("\u2019", "'").replace("\u201b", "'")
    s = s.replace("\u201c", '"').replace("\u201d", '"').replace("\u00a0", " ")
    return s.lower()


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


# ============================================================
# Taxonomy (port of taxonomy.js) — conservative matchers
# ============================================================

def _esc(s: str) -> str:
    return re.escape(s)


def _skill(key, label, aliases, extra=None):
    parts = [_esc(a) for a in aliases] + (extra or [])
    pattern = r"(?<![a-z0-9+#./-])(" + "|".join(parts) + r")(?![a-z0-9+#])"
    return {"key": key, "label": label, "re": re.compile(pattern, re.I)}


LANGUAGES = [
    _skill("python", "Python", ["python"]),
    _skill("java", "Java", ["java"]),
    _skill("javascript", "JavaScript", ["javascript", "java script", r"js\b"], [r"js"]),
    _skill("typescript", "TypeScript", ["typescript", "type script", r"ts\b"], [r"ts"]),
    _skill("csharp", "C#", [r"c#\b", "c sharp", "csharp"]),
    _skill("cpp", "C++", [r"c\+\+", "cpp"]),
    _skill("c_lang", "C", [r"\bc\b"]),
    _skill("go_lang", "Go", ["golang", r"\bgo\b(?!al)"]),
    _skill("rust", "Rust", ["rust"]),
    _skill("kotlin", "Kotlin", ["kotlin"]),
    _skill("swift", "Swift", ["swift"]),
    _skill("php", "PHP", ["php"]),
    _skill("ruby", "Ruby", ["ruby", "ruby on rails"]),
    _skill("scala", "Scala", ["scala"]),
    _skill("r_lang", "R", [r"\br\b"]),
    _skill("matlab", "MATLAB", ["matlab"]),
    _skill("sql", "SQL", ["sql"], ["mysql", "postgresql", "postgres", "sqlite", "t-sql", "pl/sql"]),
    _skill("html", "HTML", [r"html5?", "xhtml"]),
    _skill("css", "CSS", [r"css3?", "scss", "sass"]),
    _skill("bash", "Shell scripting", ["bash", "shell script", "zsh", "powershell", "command line", "command-line"]),
    _skill("vba", "VBA", [r"vba\b"]),
]

FRAMEWORKS = [
    _skill("react", "React", [r"react\.?js", "react"]),
    _skill("nextjs", "Next.js", [r"next\.?js"]),
    _skill("vue", "Vue", [r"vue\.?js", "vue"]),
    _skill("angular", "Angular", [r"angular\.?js", "angular"]),
    _skill("nodejs", "Node.js", [r"node\.?js", "node"]),
    _skill("express", "Express", [r"express\.?js", "express"]),
    _skill("django", "Django", ["django"]),
    _skill("flask", "Flask", ["flask"]),
    _skill("fastapi", "FastAPI", ["fastapi", "fast api"]),
    _skill("spring", "Spring", ["spring boot", "spring"]),
    _skill("dotnet", ".NET", [r"\.net\b", "dotnet", r"asp\.net"]),
    _skill("laravel", "Laravel", ["laravel"]),
    _skill("tailwind", "Tailwind CSS", ["tailwind"]),
    _skill("bootstrap", "Bootstrap", ["bootstrap"]),
    _skill("pytorch", "PyTorch", ["pytorch", "torch"]),
    _skill("tensorflow", "TensorFlow", ["tensorflow", r"tf\.keras"]),
    _skill("keras", "Keras", ["keras"]),
    _skill("sklearn", "scikit-learn", ["scikit-learn", "scikit learn", "sklearn"]),
    _skill("pandas", "pandas", ["pandas"]),
    _skill("numpy", "NumPy", ["numpy"]),
    _skill("scipy", "SciPy", ["scipy"]),
    _skill("opencv", "OpenCV", ["opencv"]),
    _skill("huggingface", "Hugging Face", ["hugging ?face", "transformers(?! model)"]),
    _skill("spark", "Apache Spark", ["(apache )?spark", "pyspark"]),
    _skill("hadoop", "Hadoop", ["hadoop"]),
    _skill("kafka", "Kafka", ["kafka"]),
    _skill("airflow", "Airflow", ["airflow"]),
    _skill("dbt", "dbt", [r"\bdbt\b"]),
    _skill("powerbi", "Power BI", ["power ?bi"]),
    _skill("tableau", "Tableau", ["tableau"]),
    _skill("flutter", "Flutter", ["flutter"]),
    _skill("reactnative", "React Native", ["react native"]),
    _skill("android", "Android", ["android"]),
    _skill("ios", "iOS", [r"ios\b"]),
]

TOOLS = [
    _skill("git", "Git", [r"git\b"], ["github", "gitlab", "bitbucket", "version control"]),
    _skill("docker", "Docker", ["docker", r"containers?"]),
    _skill("kubernetes", "Kubernetes", ["kubernetes", r"\bk8s\b"]),
    _skill("aws", "AWS", ["aws", "amazon web services"], ["ec2", r"\bs3\b", "lambda", "dynamodb", "sagemaker"]),
    _skill("azure", "Azure", ["azure", "microsoft azure"]),
    _skill("gcp", "Google Cloud", ["google cloud", r"\bgcp\b", "bigquery", "vertex ai"]),
    _skill("ci_cd", "CI/CD", ["ci/cd", "continuous integration", "continuous delivery", "continuous deployment", "jenkins", "github actions", "gitlab ci", "circleci"]),
    _skill("terraform", "Terraform", ["terraform", "infrastructure as code"]),
    _skill("linux", "Linux", ["linux", "ubuntu", "unix"]),
    _skill("jira", "Jira", [r"\bjira\b"]),
    _skill("rest", "REST APIs", [r"rest(api)?s?\b", "restful"]),
    _skill("graphql", "GraphQL", ["graphql"]),
    _skill("microservices", "Microservices", [r"micro ?services?"]),
    _skill("redis", "Redis", ["redis"]),
    _skill("mongodb", "MongoDB", ["mongodb", "mongo"]),
    _skill("postgresql", "PostgreSQL", ["postgresql", "postgres"]),
    _skill("mysql", "MySQL", ["mysql"]),
    _skill("elasticsearch", "Elasticsearch", ["elastic ?search", "opensearch"]),
    _skill("snowflake", "Snowflake", ["snowflake"]),
    _skill("excel", "Excel", ["(ms |microsoft )?excel", "google sheets", r"spreadsheets?", r"pivot tables?", "vlookup"]),
    _skill("powerpoint", "PowerPoint", ["(ms |microsoft )?powerpoint", r"presentations?"]),
    _skill("word", "Word", ["(ms |microsoft )?word\b", "documentation"]),
    _skill("figma", "Figma", ["figma"]),
    _skill("postman", "Postman", ["postman"]),
    _skill("agile", "Agile/Scrum", ["agile", "scrum", "kanban", r"sprints?"]),
    _skill("mlflow", "MLflow", ["mlflow"]),
    _skill("streamlit", "Streamlit", ["streamlit"]),
    _skill("powerautomate", "Power Automate", ["power automate", "powerapps", "power platform"]),
]

MLDATA = [
    _skill("machine_learning", "Machine Learning", ["machine learning", r"\bml\b", "predictive model"]),
    _skill("deep_learning", "Deep Learning", ["deep learning", r"neural networks?"]),
    _skill("nlp", "NLP", [r"\bnlp\b", "natural language processing", "text classification", "sentiment analysis"]),
    _skill("computer_vision", "Computer Vision", ["computer vision", r"\bcv\b models?", r"image (classification|recognition|segmentation)"]),
    _skill("llm", "LLMs", [r"\bllms?\b", r"large language models?", "gpt", r"\bbert\b", "prompt engineering", r"rag\b", r"retrieval.augmented"]),
    _skill("data_analysis", "Data Analysis", ["data analysis", "data analytics", "analyzing data", "exploratory data", r"\beda\b", "data cleaning", "data wrangling", "statistical analysis"]),
    _skill("statistics", "Statistics", [r"statistic(al|s)?", "regression", "hypothesis test", "a/b test", "probability"]),
    _skill("data_viz", "Data Visualization", [r"data visuali[sz]ation", r"dashboards?", "matplotlib", "seaborn", "plotly", r"charts?"]),
    _skill("data_engineering", "Data Engineering", [r"data pipelines?", "etl", "elt", "data warehouse", "data modeling"]),
    _skill("mlops", "MLOps", ["mlops", "model deployment", "model serving", "model monitoring", r"deployment of (ml )?models?", r"deployed (models?|ml)"]),
    _skill("feature_eng", "Feature Engineering", ["feature engineering", "feature selection", "feature extraction"]),
    _skill("recommendation", "Recommender Systems", [r"recommend(er|ation) systems?", "collaborative filtering"]),
    _skill("time_series", "Time Series", ["time series", "forecasting"]),
    _skill("sql_analytics", "SQL Analytics", [r"\bsql\b"]),
    _skill("big_data", "Big Data", ["big data", r"large (scale |)datasets?", r"distributed (computing|data)"]),
    _skill("experimentation", "Experimentation", [r"a/b tests?", r"experiment(s|ation)"]),
    _skill("optimization", "Optimization", [r"optimi[sz]ation", "hyperparameter"]),
]

DOMAIN = [
    _skill("finance", "Finance domain", [r"financial (modeling|analysis|data)", "fintech", "banking", "credit risk", "trading"]),
    _skill("healthcare", "Healthcare domain", ["healthcare", "clinical", r"medical (data|records)", "patient"]),
    _skill("ecommerce", "E-commerce domain", ["e-?commerce", "retail", "marketplace"]),
    _skill("marketing", "Marketing analytics", [r"marketing (analytics|data|campaigns?)", r"\bseo\b", "customer segmentation", "churn"]),
    _skill("product_mgmt", "Product sense", ["product requirements", "roadmap", "stakeholder", "cross-functional", "user research", "user stories"]),
    _skill("teaching", "Teaching/Mentoring", ["mentored", "taught", "trained", "tutor", r"workshops?", "led a team", "team lead"]),
    _skill("writing", "Technical writing", ["documented", "documentation", "technical writing", r"blog posts?", r"articles?"]),
    _skill("research", "Research", [r"research (paper|experience|project|assistant)", "published", r"\bthesis\b", r"\bpatent"]),
]

ALL_SKILLS = LANGUAGES + FRAMEWORKS + TOOLS + MLDATA + DOMAIN

SOFT = [
    "communication", "leadership", "teamwork", "collaboration", "problem.solving",
    "critical thinking", "time management", "adaptability", "ownership", "mentoring",
    "presentation", "stakeholder management", "attention to detail", "self.starter",
]


def _ctx_around(text: str, idx: int, mlen: int) -> str:
    left = text.rfind(" ", max(0, idx - 90), idx)
    start = left if left != -1 else max(0, idx - 90)
    end = text.find(".", idx + mlen)
    if end == -1 or end - idx > 160:
        end = min(len(text), idx + 170)
    return text[start:end].strip()


def match_list(text: str, skills):
    t = norm(text)
    out = []
    for s in skills:
        m = s["re"].search(t)
        if m:
            out.append({
                "key": s["key"],
                "label": s["label"],
                "count": len(s["re"].findall(t)),
                "ctx": _ctx_around(t, m.start(), len(m.group(0))),
            })
    out.sort(key=lambda x: -x["count"])
    return out


def match_all(text):
    return match_list(text, ALL_SKILLS)


def find_soft(text: str):
    t = norm(text)
    found = []
    for s in SOFT:
        if re.search(r"(?<![a-z])" + re.escape(s), t):
            found.append(s.replace(".", " "))
    return found


def match_keyword(text: str, keyword: str) -> int:
    t = norm(text)
    kw = norm(keyword).strip()
    if not kw:
        return 0
    pattern = r"(?<![a-z0-9+#./-])(" + re.escape(kw) + r")(?![a-z0-9+#])"
    return len(re.findall(pattern, t, re.I))


def evidence_around(text: str, keyword: str):
    t = norm(text)
    pattern = r"(?<![a-z0-9+#./-])(" + re.escape(norm(keyword).strip()) + r")(?![a-z0-9+#])"
    m = re.search(pattern, t, re.I)
    if not m:
        return None
    left = t.rfind(" ", max(0, m.start() - 90), m.start())
    start = left if left != -1 else max(0, m.start() - 90)
    end = t.find(".", m.start() + len(m.group(0)))
    if end == -1 or end - m.start() > 170:
        end = min(len(t), m.start() + 180)
    return t[start:end].strip()


# ============================================================
# Role hints (port of roles.js)
# ============================================================

ROLES = [
    {"key": "ml_engineer", "label": "ML Engineer",
     "match": re.compile(r"\b(machine learning|ml|ai/ ?ml|deep learning|ai)\s+(engineer|developer|specialist)", re.I),
     "core": ["python", "machine_learning", "deep_learning", "mlops", "statistics", "pytorch", "tensorflow"],
     "good": ["sql", "docker", "aws", "llm", "nlp", "computer_vision", "spark", "feature_eng", "experimentation"],
     "emphasis": {"skills": 1.15, "projects": 1.3, "evidence": 1.25}},
    {"key": "data_scientist", "label": "Data Scientist",
     "match": re.compile(r"\bdata science|\bdata scientist", re.I),
     "core": ["python", "machine_learning", "statistics", "sql_analytics", "data_analysis"],
     "good": ["deep_learning", "experimentation", "data_viz", "spark", "nlp", "optimization", "research"],
     "emphasis": {"skills": 1.1, "projects": 1.2, "evidence": 1.15}},
    {"key": "data_analyst", "label": "Data Analyst",
     "match": re.compile(r"\bdata analyst|\bbusiness intelligence|\bbi analyst", re.I),
     "core": ["sql_analytics", "excel", "data_viz", "data_analysis", "statistics"],
     "good": ["python", "powerbi", "tableau", "statistics", "experimentation", "finance", "marketing"],
     "emphasis": {"skills": 1.1, "experience": 1.15}},
    {"key": "data_engineer", "label": "Data Engineer",
     "match": re.compile(r"\bdata engineer", re.I),
     "core": ["python", "sql", "data_engineering", "spark"],
     "good": ["aws", "gcp", "azure", "kafka", "airflow", "snowflake", "docker", "dbt"],
     "emphasis": {"skills": 1.15}},
    {"key": "software_engineer", "label": "Software Engineer",
     "match": re.compile(r"\b(software|sde|sdet)\s*(engineer|developer)|\bdeveloper\b", re.I),
     "core": ["data structures", "algorithms", "problem.solving", "version control"],
     "good": ["microservices", "ci_cd", "docker", "testing", "system design"],
     "emphasis": {}},
    {"key": "frontend_engineer", "label": "Frontend Engineer",
     "match": re.compile(r"\bfront.?end|\bui (developer|engineer)", re.I),
     "core": ["javascript", "react", "css", "html"],
     "good": ["typescript", "nextjs", "testing", "figma", "accessibility"],
     "emphasis": {"projects": 1.2}},
    {"key": "backend_engineer", "label": "Backend Engineer",
     "match": re.compile(r"\bback.?end", re.I),
     "core": ["rest", "microservices", "sql", "databases"],
     "good": ["docker", "kubernetes", "ci_cd", "redis", "kafka", "graphql"],
     "emphasis": {"skills": 1.1}},
    {"key": "fullstack_engineer", "label": "Full-Stack Engineer",
     "match": re.compile(r"\bfull.?stack", re.I),
     "core": ["javascript", "react", "nodejs", "sql"],
     "good": ["typescript", "docker", "aws", "ci_cd", "nextjs"],
     "emphasis": {"projects": 1.15}},
    {"key": "devops_engineer", "label": "DevOps / SRE",
     "match": re.compile(r"\bdevops|\bsre\b|\bsite reliability|\bplatform engineer|\bcloud engineer", re.I),
     "core": ["linux", "docker", "kubernetes", "ci_cd", "terraform"],
     "good": ["aws", "gcp", "azure", "python"],
     "emphasis": {"skills": 1.15, "experience": 1.1}},
    {"key": "product_manager", "label": "Product Manager",
     "match": re.compile(r"\bproduct (manager|owner)", re.I),
     "core": ["product_mgmt", "stakeholder management", "roadmap"],
     "good": ["data_analysis", "sql_analytics", "agile", "experimentation"],
     "emphasis": {"experience": 1.25, "responsibilities": 1.2}},
    {"key": "business_analyst", "label": "Business Analyst",
     "match": re.compile(r"\bbusiness analyst|\bba\b", re.I),
     "core": ["excel", "data_analysis", "requirements", "stakeholder management"],
     "good": ["sql_analytics", "powerbi", "tableau", "agile"],
     "emphasis": {"experience": 1.15}},
    {"key": "qa_engineer", "label": "QA Engineer",
     "match": re.compile(r"\b(qa|quality assurance|test)\s*(engineer|analyst)?", re.I),
     "core": ["testing", "automation", "selenium"],
     "good": ["python", "java", "ci_cd", "agile"],
     "emphasis": {}},
    {"key": "designer", "label": "Designer",
     "match": re.compile(r"\b(ui|ux|product) designer|\bdesigner\b", re.I),
     "core": ["figma", "user research", "prototyping"],
     "good": ["design systems", "accessibility", "html", "usability testing"],
     "emphasis": {"projects": 1.3}},
    {"key": "project_manager", "label": "Project Manager",
     "match": re.compile(r"\bproject manager|\bscrum master|\bprogram manager", re.I),
     "core": ["agile", "stakeholder management", "planning"],
     "good": ["jira", "risk management", "reporting"],
     "emphasis": {"experience": 1.3, "responsibilities": 1.15}},
]


def detect_role(title_text):
    t = norm(title_text or "")
    for r in ROLES:
        if r["match"].search(t):
            return r
    return None


def role_is_core(role, skill_key, skill_label):
    if not role:
        return False
    for c in role["core"]:
        if c == skill_key or norm(skill_label).find(norm(c)) != -1:
            return True
    return False


# ============================================================
# Job description parsing (port of jd.js)
# ============================================================

JD_SECTIONS = [
    {"key": "responsibilities", "re": re.compile(r"^(what you'?ll (be )?(do|work on)|responsibilit(y|ies)|the role|about the (role|job)|your (role|responsibilities)|day.?to.?day|duties)\b", re.I)},
    {"key": "requirements", "re": re.compile(r"^(what (we|you)('|’)?(re|are)? (looking for|need)|requirements|qualifications|required (skills|qualifications|experience)|must.?haves?|who you are|you have|about you|skills (and|&) (qualifications|experience)|we'?re looking for)\b", re.I)},
    {"key": "preferred", "re": re.compile(r"^(preferred( qualifications| skills)?|nice to haves?|bonus( points| skills)?|plus(es)?|good to have|desirable)\b", re.I)},
    {"key": "benefits", "re": re.compile(r"^(benefits|perks|what we offer|compensation|salary)\b", re.I)},
    {"key": "about", "re": re.compile(r"^(about (us|the company|our team)|the company|who we are|our mission)\b", re.I)},
]


def _split_jd_sections(lines):
    sections = []
    current = {"key": "intro", "lines": []}
    for raw in lines:
        line = re.sub(r"\s+", " ", str(raw or "")).strip()
        if not line:
            continue
        clean = re.sub(r"[^a-zA-Z\s'’]", " ", line).strip()
        matched = None
        if len(clean) <= 50:
            for sec in JD_SECTIONS:
                if sec["re"].search(clean):
                    matched = sec
                    break
        if matched:
            if current["lines"]:
                sections.append(current)
            current = {"key": matched["key"], "lines": []}
        else:
            current["lines"].append(line)
    if current["lines"]:
        sections.append(current)
    return sections


def _jd_section_text(sections, keys):
    out = []
    for s in sections:
        if s["key"] in keys:
            out.extend(s["lines"])
    return out


def _detect_title(text):
    m = re.search(r"^\s*(job\s*title|position|role|opening)\s*[:\-]\s*(.+)$", text, re.I | re.M)
    if m:
        return m.group(2).strip()[:80]
    first_lines = [l.strip() for l in text.split("\r?\n")[:4]] if False else [l.strip() for l in text.splitlines()[:4]]
    for l in first_lines:
        if not l or len(l) > 70:
            continue
        if re.search(r"(engineer|developer|scientist|analyst|manager|designer|architect|intern|specialist|consultant|administrator|lead|director)", l, re.I) \
           and not re.search(r"[.!?]$", l) and not re.search(r"about|company|we are|join", l, re.I):
            return re.sub(r"\s*[|(–—-].*$", "", l).strip()
    return None


def _detect_company(text):
    m = re.search(r"^\s*company\s*[:\-]\s*(.+)$", text, re.I | re.M) or re.search(r"at\s+([A-Z][A-Za-z0-9&.'\- ]{1,40})\s*[,\n]", text)
    if m:
        return m.group(1).strip()
    m2 = re.search(r"([A-Z][A-Za-z0-9&.'\- ]{2,40})\s+is (a|an|the)\b", text)
    if m2 and not re.match(r"^(we|it|this|the|our)$", m2.group(1), re.I):
        return m2.group(1).strip()
    return None


def _extract_years(text):
    t = norm(text)
    patterns = [
        r"\b(\d{1,2})\s*\+\s*(?:years?|yrs)\b",
        r"\bat least\s+(\d{1,2})\s*(?:years?|yrs)\b",
        r"\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:years?|yrs)\b",
        r"\b(?:minimum|min(?:imum)? of|over|more than)\s+(\d{1,2})\s*(?:years?|yrs)\b",
        r"\b(\d{1,2})\s*(?:years?|yrs)\s+(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+|hands.?on\s+|work\s+)?experience\b",
    ]
    best = None
    for p in patterns:
        for m in re.finditer(p, t):
            lo = int(m.group(1))
            if lo <= 15:
                hi = int(m.group(2)) if m.lastindex and m.lastindex >= 2 and m.group(2) else None
                if best is None or lo < best["min"]:
                    best = {"min": lo, "max": hi, "raw": m.group(0)}
    return best


def _seniority_of(text, title):
    t = norm(title or "") + " " + norm(text or "")[:400]
    if re.search(r"\b(intern|internship|trainee)\b", t):
        return "Internship"
    if re.search(r"\b(junior|entry.?level|graduate|fresher|associate)\b", t):
        return "Junior"
    if re.search(r"\b(principal|staff|distinguished)\b", t):
        return "Senior+"
    if re.search(r"\b(senior|sr\.?|lead|manager|head of)\b", t):
        return "Mid-Senior"
    return None


EDU_PATTERNS = [
    {"level": "PhD", "re": re.compile(r"\b(ph\.?d|doctorate|doctoral)\b", re.I)},
    {"level": "Master's", "re": re.compile(r"\b(master'?s?(?:'s)?|m\.?s\.?c?\b|m\.?tech|m\.?e\.?\b|mba|post.?graduate|postgraduate)\b", re.I)},
    {"level": "Bachelor's", "re": re.compile(r"\b(bachelor'?s?(?:'s)?|b\.?tech|b\.?e\.?\b|b\.?sc|undergraduate|b\.?a\.?\b|4.?year degree)\b", re.I)},
]


def _extract_education(text):
    for p in EDU_PATTERNS:
        m = p["re"].search(text)
        if m:
            idx = m.start()
            sent_start = text.rfind(".", 0, idx - 1) + 1 if idx > 0 else 0
            sentence = text[sent_start:idx + 120].strip()
            return {"level": p["level"], "raw": m.group(0), "context": sentence[:160]}
    if re.search(r"\bdegree\b", text, re.I):
        return {"level": "Degree (field unspecified)", "raw": "degree", "context": None}
    return {"level": None, "raw": None, "context": None}


def _extract_certifications(text):
    certs = []
    for l in text.splitlines():
        if re.search(r"\b(certif(icate|ication|ied)|license|credentials?)\b", l, re.I) and len(l.strip()) < 220:
            s = re.sub(r"^[-•*\u2022]\s*", "", l.strip())
            if s and s not in certs:
                certs.append(s)
    return certs[:6]


STOPWORDS = set(("a,an,the,and,or,but,if,then,else,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,being,"
    "this,that,these,those,it,its,we,our,us,you,your,you're,they,their,them,he,she,his,her,i,me,my,"
    "will,would,should,can,could,may,might,must,shall,do,does,did,have,has,had,not,no,yes,"
    "about,into,over,under,again,further,once,here,there,when,where,why,how,all,any,both,each,few,more,most,other,some,such,only,own,same,so,than,too,very,"
    "work,working,works,team,teams,role,job,position,company,candidate,candidates,applicant,applicants,"
    "experience,years,year,ability,skills,skill,knowledge,understanding,plus,strong,excellent,good,great,"
    "including,include,includes,using,use,used,new,well,also,who,what,across,within,per,via,while,help,"
    "join,looking,apply,application,opportunity,benefits,salary,equal,employer,please,etc,based,capable,"
    "responsibilities,responsibility,requirements,required,preferred,qualification,qualifications,ideal,"
    "get,make,made,like,love,want,need,needs,daily,day,time,times,part,full,remote,hybrid,onsite,office").split(","))


def _rank_keywords(text, limit=30):
    words = re.findall(r"[a-z][a-z0-9+#.\-]{1,30}", norm(text))
    freq = {}
    for w in words:
        clean = w.rstrip("-.")
        if len(clean) < 3 or clean in STOPWORDS:
            continue
        freq[clean] = freq.get(clean, 0) + 1
    ranked = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
    return [{"word": w, "count": c} for w, c in ranked]


def parse_job_description(raw_text, details=None):
    details = details or {}
    text = str(raw_text or "").strip()
    sections = _split_jd_sections(text.splitlines())

    title = details.get("title") or _detect_title(text)
    company = details.get("company") or _detect_company(text)

    req_lines = _jd_section_text(sections, {"requirements"})
    pref_lines = _jd_section_text(sections, {"preferred"})
    resp_lines = _jd_section_text(sections, {"responsibilities"})

    requirement_text = "\n".join(req_lines) if req_lines else text
    preferred_text = "\n".join(pref_lines)

    years = _extract_years(requirement_text)
    edu = _extract_education(requirement_text)

    return {
        "meta": {
            "mode": details.get("mode", "text"),
            "url": details.get("url"),
            "parsedAt": datetime.utcnow().isoformat() + "Z",
            "wordCount": len(re.findall(r"\S+", text)),
        },
        "text": text,
        "title": title,
        "company": company,
        "sections": [{"key": s["key"], "lineCount": len(s["lines"])} for s in sections],
        "responsibilities": resp_lines,
        "requirementLines": req_lines,
        "preferredLines": pref_lines,
        "requirements": {
            "years": years,
            "seniority": _seniority_of(text, title),
            "education": edu,
            "certifications": _extract_certifications(requirement_text),
        },
        "keywords": _rank_keywords(text, 30),
        "softSkills": find_soft(text),
        "skillMentions": {
            "langs": match_list(text, LANGUAGES),
            "frameworks": match_list(text, FRAMEWORKS),
            "tools": match_list(text, TOOLS),
            "ml": match_list(text, MLDATA),
            "domain": match_list(text, DOMAIN),
        },
    }


# ============================================================
# Resume parsing (port of parse.js)
# ============================================================

SECTION_PATTERNS = [
    {"key": "summary", "re": re.compile(r"^(career\s+)?(summary|objective|profile|professional\s+(summary|profile)|about\s+me|about)\b", re.I)},
    {"key": "experience", "re": re.compile(r"^(work\s+|professional\s+|relevant\s+|employment\s+)?(experience|history|work\s+history|employment)\b", re.I)},
    {"key": "education", "re": re.compile(r"^(education|academic\s+(background|qualifications?))\b", re.I)},
    {"key": "projects", "re": re.compile(r"^(projects?|personal\s+projects?|academic\s+projects?|selected\s+projects?)\b", re.I)},
    {"key": "skills", "re": re.compile(r"^(technical\s+)?(skills|core\s+(competencies|skills)|skills?(\s*&\s*(tools|interests))?|technologies|toolkit)\b", re.I)},
    {"key": "certifications", "re": re.compile(r"^(certifications?|licenses?|certificates?|courses?(\s*&\s*certifications?)?)\b", re.I)},
    {"key": "achievements", "re": re.compile(r"^(achievements?|awards?|honors?|honours?|accomplishments?|extra.?curricular)\b", re.I)},
    {"key": "links", "re": re.compile(r"^(links?|portfolio|contact)\b", re.I)},
    {"key": "publications", "re": re.compile(r"^(publications?|papers?|research)\b", re.I)},
    {"key": "volunteer", "re": re.compile(r"^(volunteer(ing)?|community)\b", re.I)},
]


def _detect_sections(lines):
    sections = []
    current = {"key": "header", "lines": []}
    for raw in lines:
        line = re.sub(r"\s+", " ", str(raw or "")).strip()
        if not line:
            continue
        clean = re.sub(r"[^a-zA-Z\s]", " ", line).strip()
        matched = None
        if len(clean) <= 40:
            for sp in SECTION_PATTERNS:
                if sp["re"].search(clean):
                    matched = sp
                    break
        if matched:
            if current["lines"] or current["key"] == "header":
                sections.append(current)
            current = {"key": matched["key"], "lines": []}
        else:
            current["lines"].append(line)
    sections.append(current)
    return [s for s in sections if s["lines"] or s["key"] == "header"]


def _section_text(sections, key):
    out = []
    for s in sections:
        if s["key"] == key:
            out.extend(s["lines"])
    return "\n".join(out)


def _extract_contact(lines):
    head = "\n".join(lines[:12])
    all_text = "\n".join(lines)
    contact = {}

    email = re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", all_text)
    if email:
        contact["email"] = email.group(0)

    phone = re.search(r"(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b", all_text)
    if phone:
        contact["phone"] = phone.group(0).strip()

    gh = re.search(r"(?:github\.com/)([A-Za-z0-9_-]+)", all_text, re.I)
    if gh:
        contact["github"] = "github.com/" + gh.group(1)

    li = re.search(r"(?:linkedin\.com/in/)([A-Za-z0-9_-]+)", all_text, re.I)
    if li:
        contact["linkedin"] = "linkedin.com/in/" + li.group(1)

    portfolio = re.search(r"\b((?:https?://)?(?:www\.)?[a-z0-9-]+\.(?:io|dev|me|com|net|xyz|app)/?[a-z0-9-]*)\b", all_text, re.I)
    if portfolio and not re.search(r"github|linkedin", portfolio.group(1), re.I):
        contact["portfolio"] = portfolio.group(1)

    loc = re.search(r"([A-Z][a-zA-Z .'-]+,\s*(?:[A-Z]{2}\b|[A-Z][a-zA-Z]+))\s*(?:•|\||\n|$)", head)
    if loc and len(loc.group(1)) < 40:
        contact["location"] = loc.group(1).strip()

    contact["hasEmail"] = bool(contact.get("email"))
    contact["hasPhone"] = bool(contact.get("phone"))
    contact["hasLinkedIn"] = bool(contact.get("linkedin"))
    contact["hasGithub"] = bool(contact.get("github"))
    return contact


def _extract_name(lines):
    for i in range(min(5, len(lines))):
        l = lines[i].strip()
        if not l or len(l) > 48:
            continue
        if re.search(r"[a-zA-Z]", l) and not re.search(r"@|\d{3}|http", l, re.I):
            words = l.split()
            if 2 <= len(words) <= 5:
                cleaned = [re.sub(r"[^A-Za-z'.-]", "", w) for w in words]
                return " ".join([w for w in cleaned if w])
    return None


DATE_RE = re.compile(
    r"((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?\d{2,4}\s*(–|—|-|to)\s*"
    r"((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?\d{2,4}|present|current|now|date))"
    r"|((19|20)\d{2}\s*(–|—|-|to)\s*((19|20)\d{2}|present|current))",
    re.I,
)

DEGREE_RE = re.compile(
    r"\b(b\.?tech|b\.?e\.?|bachelor(?:'s)?|b\.?sc|b\.?a\.?|m\.?tech|m\.?e\.?|master(?:'s)?|m\.?sc|m\.?a\.?|mba|ph\.?d|doctorate|diploma|associate|high school|secondary school|class (?:x|xi|xii|10|12))\b",
    re.I,
)


def _parse_experience(sections):
    text = _section_text(sections, "experience")
    if not text:
        return []
    entries = []
    cur = None
    for line in text.split("\n"):
        l = line.strip()
        if not l:
            continue
        if DATE_RE.search(l):
            if cur:
                entries.append(cur)
            header_part = DATE_RE.sub("", l)
            header_part = re.sub(r"[|•·–—-]{1,2}\s*$", "", header_part).strip()
            cur = {"header": header_part, "dates": l, "bullets": [], "raw": [l], "title": None}
            continue
        if cur:
            if re.match(r"^[•\-*·‣◦]|\d+[.)]\s", l):
                cur["bullets"].append(re.sub(r"^[•\-*·‣◦]\s*", "", l).strip())
            elif len(l) < 100 and not cur["bullets"] and not cur["title"] and re.search(r"[a-z]", l):
                if not cur["header"]:
                    cur["header"] = l
                else:
                    cur["title"] = l
            else:
                cur["bullets"].append(l)
            cur["raw"].append(l)
    if cur:
        entries.append(cur)
    for e in entries:
        e["company"] = e["header"] or e.get("title") or None
        e["title"] = e.get("title") or None
    return entries


def _parse_education(sections):
    text = _section_text(sections, "education")
    if not text:
        return []
    entries = []
    cur = None
    for line in text.split("\n"):
        l = line.strip()
        if not l:
            continue
        if DEGREE_RE.search(l) or DATE_RE.search(l):
            if cur:
                entries.append(cur)
            dm = DEGREE_RE.search(l)
            cur = {"text": l, "degree": dm.group(0) if dm else None,
                   "dates": (DATE_RE.search(l).group(0) if DATE_RE.search(l) else None),
                   "institution": None}
        elif cur:
            if re.match(r"^relevant\s+coursework\b", l, re.I):
                cur["text"] += "\n" + l  # coursework detail — not an institution
            else:
                cur["institution"] = (cur["institution"] + " " + l) if cur["institution"] else l
                cur["text"] += "\n" + l
        else:
            entries.append({"text": l, "degree": None, "dates": None, "institution": None})
    if cur:
        entries.append(cur)
    return entries


def _parse_projects(sections):
    text = _section_text(sections, "projects")
    if not text:
        return []
    entries = []
    cur = None
    for line in text.split("\n"):
        l = line.strip()
        if not l:
            continue
        is_head = len(l) < 80 and not re.search(r"[.!?]$", l) and not re.match(r"^[•\-*·]", l)
        if is_head and (cur is None or cur["bullets"]):
            if cur:
                entries.append(cur)
            cur = {"name": re.sub(r"[|:•].*$", "", l).strip(), "bullets": [], "tech": []}
        elif cur:
            cur["bullets"].append(re.sub(r"^[•\-*·‣◦]\s*", "", l).strip())
        else:
            entries.append({"name": l[:60], "bullets": [], "tech": []})
    if cur:
        entries.append(cur)
    return entries


NUM_RE = re.compile(
    r"(\d+(?:\.\d+)?\s?%|\$\s?\d[\d,.]*(?:\s?[kmb]\b)?|\b\d[\d,]*\s?\+|\b\d{2,}\b(?:\s?(?:users|customers|clients|students|records|rows|hours|days|weeks|projects|models|apps|members|people|countries|cities))?|\b\d+(?:\.\d+)?\s?(?:x|times)\b)",
    re.I,
)

WEAK_STARTS = re.compile(
    r"^(worked on|worked with|responsible for|helped (with|to)?|assisted (with|in)?|involved in|participated in|part of|took part in|was part of|duties included|tasked with|did |made |used |handled|various|several|multiple tasks|day.?to.?day)\b",
    re.I,
)

ACTION_STARTS = re.compile(
    r"^(built|developed|designed|created|implemented|led|launched|delivered|improved|reduced|increased|automated|migrated|optimized|optimised|architected|deployed|shipped|trained|analyzed|analysed|managed|owned|drove|streamlined|integrated|mentored|established|initiated|scaled|refactored|engineered|presented|published|achieved)\b",
    re.I,
)


def analyze_bullet(b):
    l = b.strip()
    words = l.split()
    return {
        "text": l,
        "hasMetric": bool(NUM_RE.search(l)),
        "metric": NUM_RE.search(l).group(0) if NUM_RE.search(l) else None,
        "weakStart": bool(WEAK_STARTS.search(l)),
        "strongStart": bool(ACTION_STARTS.search(l)),
        "long": len(words) > 34,
        "short": len(words) < 6,
    }


def _detect_formatting_risks(lines, sections, full_text):
    risks = []
    keys = [s["key"] for s in sections]
    if not any("experience" in k for k in keys):
        risks.append({"risk": "No standard Experience section detected", "severity": "high"})
    if not any("education" in k for k in keys):
        risks.append({"risk": "No Education section detected", "severity": "medium"})
    if not any("skills" in k for k in keys):
        risks.append({"risk": "No Skills section detected — ATS keyword matching relies on it", "severity": "medium"})
    bullet_count = len([l for l in lines if re.match(r"^[•\-*·‣◦]\s|\d+[.)]\s", l.strip())])
    if bullet_count == 0:
        risks.append({"risk": "No bullet points found — dense paragraphs are harder for both ATS and recruiters to scan", "severity": "medium"})
    elif bullet_count < 4:
        risks.append({"risk": f"Very few bullet points ({bullet_count}) — most roles expect scannable achievement bullets", "severity": "low"})
    if re.search(r"\t{2,}", full_text) or re.search(r" {6,}\S", full_text):
        risks.append({"risk": "Wide spacing or tab alignment detected — may indicate layout tables that can scramble in ATS parsing", "severity": "low"})
    standard = {"experience", "education", "skills", "projects", "summary", "certifications", "achievements", "header", "links", "publications", "volunteer"}
    unusual = [s for s in sections if s["key"] not in standard]
    if unusual:
        risks.append({"risk": "Unusual section headings: " + ", ".join('“' + s["key"] + "”" for s in unusual), "severity": "low"})
    return risks


def parse_resume(raw_text, meta=None):
    meta = meta or {}
    lines = [l.rstrip() for l in str(raw_text or "").split("\n")]
    sections = _detect_sections(lines)
    experience = _parse_experience(sections)
    education = _parse_education(sections)
    projects = _parse_projects(sections)

    skills_section = _section_text(sections, "skills")
    skills = []
    for part in re.split(r"[,;•|]+|·|\n", skills_section):
        label = re.sub(r"\s+", " ", part).strip().rstrip(".")
        if not label:
            continue
        if re.match(r"^(technical\s+)?skills?$", label, re.I):
            continue
        if len(label) > 40 or len(label.split()) > 5:
            continue
        skills.append({"label": label})

    all_bullets = []
    for e in experience:
        all_bullets.extend(analyze_bullet(b) for b in e["bullets"])
    for p in projects:
        all_bullets.extend(analyze_bullet(b) for b in p["bullets"])

    word_count = len(re.findall(r"\S+", raw_text or ""))

    return {
        "meta": {
            "fileName": meta.get("fileName"),
            "kind": meta.get("kind"),
            "pages": meta.get("pages"),
            "size": meta.get("size"),
            "uploadedAt": datetime.utcnow().isoformat() + "Z",
            "wordCount": word_count,
        },
        "text": raw_text,
        "name": _extract_name(lines),
        "contact": _extract_contact(lines),
        "sections": [{"key": s["key"], "lineCount": len(s["lines"])} for s in sections],
        "sectionMap": {s["key"]: s["lines"] for s in sections},
        "experience": experience,
        "education": education,
        "projects": projects,
        "skillsText": skills_section,
        "skills": skills,
        "bullets": all_bullets,
        "formattingRisks": _detect_formatting_risks(lines, sections, raw_text or ""),
    }


# ============================================================
# Analysis (port of analysis.js)
# ============================================================

def _build_evidence_map(resume, jd):
    resume_skills = match_all(resume["text"])
    by_key = {s["key"]: s for s in resume_skills}

    bullet_text = ""
    for l in (resume["sectionMap"].get("experience") or []):
        bullet_text += l + "\n"
    for l in (resume["sectionMap"].get("projects") or []):
        bullet_text += l + "\n"
    bullet_keys = {s["key"] for s in match_all(bullet_text)}

    req_keys = {}

    def add_req(key, label, tier, ctx):
        if key not in req_keys:
            req_keys[key] = {"key": key, "label": label, "tier": tier, "jdContext": ctx, "jdCount": 0, "extra": False}
        if tier == "required":
            req_keys[key]["tier"] = "required"
        req_keys[key]["jdCount"] += 1

    has_req = bool(jd.get("requirementLines"))
    has_pref = bool(jd.get("preferredLines"))
    pref_text = norm("\n".join(jd.get("preferredLines") or []))

    def ingest(mentions, default_tier_fn):
        for m in mentions:
            tier = default_tier_fn(m)
            add_req(m["key"], by_key.get(m["key"], m)["label"], tier, m.get("ctx"))

    def tier_for(m):
        if has_pref and not has_req:
            return "preferred"
        if has_pref and m.get("ctx") and norm(m["ctx"])[:40] in pref_text:
            return "preferred"
        return "required"

    for group in ("langs", "frameworks", "tools", "ml", "domain"):
        ingest(jd["skillMentions"].get(group) or [], tier_for)

    covered = {norm(v["label"]) for v in req_keys.values()}
    extra = []
    for kw in jd["keywords"]:
        w = kw["word"]
        if w in covered:
            continue
        if len(w) < 4:
            continue
        if any(w in l for l in covered):
            continue
        if match_keyword(resume["text"], w) > 0:
            continue
        ctx = evidence_around(jd["text"], w)
        is_pref = bool(has_pref and ctx and norm(ctx)[:30] in pref_text)
        extra.append({"key": "kw_" + w, "label": w, "tier": "preferred" if is_pref else "required",
                      "jdContext": ctx, "jdCount": kw["count"], "extra": True})
    extra.sort(key=lambda x: -x["jdCount"])
    for e in extra[:8]:
        if e["key"] not in req_keys:
            req_keys[e["key"]] = e

    requirements = []
    for r in req_keys.values():
        hit = by_key.get(r["key"])
        in_bullets = r["key"] in bullet_keys
        count = hit["count"] if hit else 0
        strength = 0 if count == 0 else (0.92 if in_bullets else 0.55)
        if count >= 3 and in_bullets:
            strength = 1
        requirements.append({**r,
            "resumeCount": count,
            "resumeContext": hit["ctx"] if hit else None,
            "inBullets": in_bullets,
            "strength": strength,
            "classification": "MISSING" if count == 0 else "DIRECT EVIDENCE",
        })

    # bulletKeys: sorted list (JSON-safe) of taxonomy keys seen in bullets
    return {"requirements": requirements, "resumeSkills": resume_skills, "bulletKeys": sorted(bullet_keys)}


def _estimate_resume_years(resume):
    total = 0
    now = datetime.utcnow()
    any_dated = False
    for e in resume.get("experience") or []:
        d = e.get("dates") or ""
        m = re.search(r"([a-z]{3,9})\.?\s*'?(\d{2,4})\s*(?:–|—|-|to)\s*([a-z]{3,9})\.?\s*'?(\d{2,4}|present|current|now)", d, re.I)
        if m:
            any_dated = True
            start_y = _parse_year(m.group(2))
            if re.search(r"present|current|now", m.group(4), re.I):
                end_y = now.year
                end_m = now.month
            else:
                end_y = _parse_year(m.group(4))
                end_m = _month_num(m.group(3))
            months = (end_y - start_y) * 12 + (end_m - _month_num(m.group(1)))
            if 0 < months < 12 * 45:
                total += months
        else:
            m2 = re.search(r"(\d{4})\s*(?:–|—|-|to)\s*(\d{4}|present|current)", d, re.I)
            if m2:
                any_dated = True
                y1 = int(m2.group(1))
                y2 = now.year if re.search(r"present|current", m2.group(2), re.I) else int(m2.group(2))
                yrs = y2 - y1
                if 0 < yrs < 45:
                    total += yrs * 12
    return {"months": total, "years": total / 12, "anyDated": any_dated}


def _parse_year(y):
    try:
        n = int(y)
    except (TypeError, ValueError):
        return 0
    if n < 100:
        return n + (1900 if n > 60 else 2000)
    return n


def _month_num(name):
    months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    idx = months.index(norm(name)[:3]) if norm(name)[:3] in months else -1
    return idx + 1 if idx != -1 else 6


def _score_required_skills(evidence):
    reqs = [r for r in evidence["requirements"] if r["tier"] == "required" and not r["extra"]]
    if not reqs:
        return {"score": None, "detail": "No distinct required skills were detected in this job description.", "items": []}
    items = [{"label": r["label"], "pct": round(r["strength"] * 100), "classification": r["classification"]} for r in reqs]
    avg = sum(r["strength"] for r in reqs) / len(reqs)
    return {"score": round(avg * 100), "detail": None, "items": items}


def _score_preferred_skills(evidence):
    prefs = [r for r in evidence["requirements"] if r["tier"] == "preferred" and not r["extra"]]
    if not prefs:
        return {"score": None, "detail": "No preferred skills were separately listed.", "items": []}
    avg = sum(max(r["strength"], 0.25) for r in prefs) / len(prefs)
    return {"score": round(avg * 100), "detail": None,
            "items": [{"label": r["label"], "pct": round(r["strength"] * 100)} for r in prefs]}


def _score_experience(resume, jd):
    est = _estimate_resume_years(resume)
    req = (jd.get("requirements") or {}).get("years")
    if req and req.get("min", 0) > 0:
        if not est["anyDated"]:
            return {"score": 50, "detail": f"The role asks for {req['min']}+ years of experience, but your resume has no parseable employment dates. Not enough evidence to determine this.", "classification": "INFERRED", "years": None, "reqYears": req["min"]}
        yrs = est["years"]
        ratio = yrs / req["min"]
        if ratio >= 1: score = 92
        elif ratio >= 0.75: score = 76
        elif ratio >= 0.5: score = 56
        elif yrs > 0.5: score = 34
        else: score = 20
        tail = "" if score >= 76 else " Adjacent experience (internships, freelance, projects) may not be counted here."
        return {"score": score, "detail": f"Role asks for {req['min']}+ years; your resume shows about {round(yrs, 1)} years of dated employment.{tail}", "classification": "JOB-REQUIRED", "years": round(yrs, 1), "reqYears": req["min"]}
    n = len(resume.get("experience") or [])
    if n == 0:
        return {"score": 40, "detail": "No experience section was detected. If you have internships, freelance or volunteer work, it should be here.", "classification": "MISSING", "years": None, "reqYears": None}
    score2 = 74 if est["anyDated"] else 58
    if n >= 2 and est["anyDated"]:
        score2 = 82
    return {"score": score2, "detail": f"No specific year requirement was stated. Your resume lists {n} experience entr{'y' if n == 1 else 'ies'}" + (" with dates." if est["anyDated"] else ", but most entries lack clear dates."), "classification": "DIRECT EVIDENCE", "years": round(est["years"], 1) if est["anyDated"] else None, "reqYears": None}


def _score_projects(resume):
    projects = resume.get("projects") or []
    bullets = resume.get("bullets") or []
    b = len([x for x in bullets if x["hasMetric"]])
    strong = len([x for x in bullets if x["strongStart"]])
    base = 28 if not projects else 40 + min(30, len(projects) * 12)
    bonus = min(20, strong * 3 + b * 4)
    score = clamp(round(base + bonus), 10, 96)
    if not projects:
        detail = "No Projects section was found. For hands-on roles, personal and academic projects are often the clearest proof of skill."
    else:
        detail = f"{len(projects)} project{'s' if len(projects) != 1 else ''} found" + (f", {b} bullet(s) with measurable results." if b else ", but few bullets include measurable results.")
    return {"score": score, "detail": detail, "classification": "DIRECT EVIDENCE" if projects else "MISSING", "count": len(projects)}


EDU_LEVELS = {"phd": 4, "master's": 3, "bachelor's": 2, "degree (field unspecified)": 2, "diploma": 1, "high school": 1}


def _resume_edu_level(resume):
    best, best_label = 0, None
    for e in resume.get("education") or []:
        t = norm(e.get("text"))
        m = re.search(r"\b(ph\.?d|doctorate|master'?s|m\.?sc|m\.?tech|mba|bachelor'?s|b\.?tech|b\.?e\b|b\.?sc|b\.?a\b|diploma|high school|secondary school)\b", t)
        if not m:
            continue
        s = m.group(0)
        lvl = 4 if norm(s).startswith("ph") or "doctorate" in s else 3 if re.search(r"master|m\.?sc|m\.?tech|mba", s) else 2 if re.search(r"bachelor|b\.?tech|b\.?e\b|b\.?sc|b\.?a\b", s) else 1
        if lvl > best:
            best, best_label = lvl, e.get("degree")
    return {"level": best, "label": best_label}


def _score_education(resume, jd):
    req = (jd.get("requirements") or {}).get("education")
    mine = _resume_edu_level(resume)
    req_level = EDU_LEVELS.get(norm(req.get("level"))) if req and req.get("level") else None
    if not req_level:
        return {"score": 78 if mine["level"] else 45,
                "detail": ("No specific degree requirement was found in the posting; your resume lists " + str(mine["label"]) + ".") if mine["label"] else ("No specific degree requirement was found in the posting" + ("; your resume lists " + str(mine["label"]) + "." if mine["level"] else ", and your resume has no clear education section.")),
                "classification": "DIRECT EVIDENCE" if mine["level"] else "MISSING"}
    if not mine["level"]:
        return {"score": 42, "detail": f"The role asks for a {req['level']} degree (or equivalent), but your resume has no parseable education section. Not enough evidence to determine this.", "classification": "INFERRED"}
    if mine["level"] >= req_level:
        return {"score": 90, "detail": f"Your education ({mine['label'] or 'degree listed'}) meets the {req['level']} requirement.", "classification": "DIRECT EVIDENCE"}
    if req_level - mine["level"] == 1:
        return {"score": 55, "detail": f"The posting asks for {req['level']}-level education; your resume shows a lower degree. Equivalent practical experience is often accepted, but it may be screened.", "classification": "INFERRED"}
    return {"score": 30, "detail": f"The posting asks for {req['level']}-level education, which your resume doesn't show.", "classification": "MISSING"}


def _score_keywords(jd, resume):
    kws = jd.get("keywords") or []
    if not kws:
        return {"score": None, "detail": None, "found": [], "missing": []}
    found, missing = [], []
    for k in kws:
        c = match_keyword(resume["text"], k["word"])
        if c > 0:
            found.append({"word": k["word"], "count": c})
        else:
            missing.append({"word": k["word"], "count": k["count"], "ctx": evidence_around(jd["text"], k["word"])})
    ratio = len(found) / len(kws)
    return {"score": round(ratio * 100), "detail": None, "found": found, "missing": missing}


_RESP_STOP = re.compile(r"^(the|and|for|with|that|this|from|will|your|our|you|are|have|using|across|into|their|them|other|about|more|than|when|what|work|role|team|help|also|well|new|who|all|any|per|via)$")


def _score_responsibilities(jd, resume):
    lines = (jd.get("responsibilities") or [])[:8]
    if not lines:
        return {"score": None, "detail": "No distinct responsibilities section was found in the posting.", "addressed": [], "weak": []}
    addressed, weak = [], []
    for line in lines:
        words = re.findall(r"[a-z][a-z0-9+#.\-]{3,}", norm(line))
        sig = [w for w in words if not _RESP_STOP.match(w)]
        if len(sig) < 2:
            continue
        hits = len([w for w in sig if match_keyword(resume["text"], w) > 0])
        ratio = hits / len(sig)
        item = {"text": line[:130], "pct": round(ratio * 100)}
        (addressed if ratio >= 0.4 else weak).append(item)
    total = len(addressed) + len(weak)
    return {"score": round((len(addressed) / total) * 100) if total else None, "detail": None, "addressed": addressed, "weak": weak}


def _score_evidence(resume):
    bullets = resume.get("bullets") or []
    if not bullets:
        return {"score": 35, "detail": "No achievement bullets were detected. Roles are usually screened on evidence, not task lists.", "classification": "MISSING"}
    n = len(bullets)
    metric_r = len([x for x in bullets if x["hasMetric"]]) / n
    strong_r = len([x for x in bullets if x["strongStart"]]) / n
    weak_r = len([x for x in bullets if x["weakStart"]]) / n
    score = clamp(round(30 + 50 * metric_r + 30 * strong_r - 22 * weak_r), 8, 97)
    parts = [f"{round(metric_r * 100)}% of your bullets contain measurable results",
             f"{round(strong_r * 100)}% start with a strong action verb"]
    if weak_r > 0.15:
        parts.append(f"{round(weak_r * 100)}% start with weak phrasing like “worked on” or “responsible for”")
    return {"score": score, "detail": "; ".join(parts) + ".", "classification": "DIRECT EVIDENCE"}


def compute_match(resume, jd):
    evidence = _build_evidence_map(resume, jd)
    role = detect_role(jd.get("title") or jd.get("text") or "")

    req_sk = _score_required_skills(evidence)
    pref_sk = _score_preferred_skills(evidence)
    exp = _score_experience(resume, jd)
    proj = _score_projects(resume)
    edu = _score_education(resume, jd)
    kws = _score_keywords(jd, resume)
    resp = _score_responsibilities(jd, resume)
    evid = _score_evidence(resume)

    categories = [
        {"key": "required_skills", "label": "Required skills", "weight": 0.30, "score": req_sk["score"], "detail": req_sk["detail"], "items": req_sk["items"]},
        {"key": "experience", "label": "Experience", "weight": 0.16, "score": exp["score"], "detail": exp["detail"], "years": exp["years"], "reqYears": exp["reqYears"]},
        {"key": "projects", "label": "Projects", "weight": 0.12, "score": proj["score"], "detail": proj["detail"]},
        {"key": "education", "label": "Education", "weight": 0.07, "score": edu["score"], "detail": edu["detail"]},
        {"key": "keywords", "label": "Job keywords", "weight": 0.12, "score": kws["score"], "detail": kws["detail"], "found": kws["found"], "missing": kws["missing"]},
        {"key": "responsibilities", "label": "Role responsibilities", "weight": 0.09, "score": resp["score"], "detail": resp["detail"], "addressed": resp["addressed"], "weak": resp["weak"]},
        {"key": "preferred_skills", "label": "Preferred skills", "weight": 0.08, "score": pref_sk["score"], "detail": pref_sk["detail"], "items": pref_sk["items"]},
        {"key": "evidence", "label": "Evidence quality", "weight": 0.06, "score": evid["score"], "detail": evid["detail"]},
    ]

    if role and role["emphasis"]:
        for k, mult in role["emphasis"].items():
            for c in categories:
                if c["key"].startswith(k):
                    c["weight"] *= mult

    wsum = sum(c["weight"] for c in categories if isinstance(c["score"], (int, float)))
    total = sum(c["weight"] * c["score"] for c in categories if isinstance(c["score"], (int, float)))
    overall = clamp(round(total / wsum) if wsum else 0, 4, 96)

    wc_r = resume["meta"]["wordCount"]
    wc_j = jd["meta"]["wordCount"]
    confidence = "Medium"
    if wc_r > 250 and wc_j > 120:
        confidence = "High"
    if wc_r < 120 or wc_j < 60:
        confidence = "Low"

    if overall >= 80: verdict = "Strong match. You're competitive for this role."
    elif overall >= 65: verdict = "Solid foundation. A few specific gaps are holding this back."
    elif overall >= 45: verdict = "Real gaps between your resume and what this role asks for."
    else: verdict = "This role expects meaningfully different or deeper experience than your resume currently shows."

    return {
        "overall": overall, "verdict": verdict, "confidence": confidence,
        "role": {"key": role["key"], "label": role["label"]} if role else None,
        "categories": categories, "evidence": evidence,
        "disclaimer": "Based on the requirements found in this job description and the evidence present in your resume. An estimate, not a prediction.",
    }


def compute_ats(resume, jd, match):
    checks = []
    c = resume["contact"]
    checks.append({
        "label": "Contact information",
        "status": "good" if c["hasEmail"] and c["hasPhone"] else ("warn" if c["hasEmail"] or c["hasPhone"] else "bad"),
        "detail": "Email and phone found." if c["hasEmail"] and c["hasPhone"] else ("Only one of email / phone was found — include both." if c["hasEmail"] or c["hasPhone"] else "No email or phone detected."),
    })
    keys = [s["key"] for s in resume["sections"]]
    standard = len([k for k in ("experience", "education", "skills") if k in keys])
    checks.append({
        "label": "Standard section headings",
        "status": "good" if standard == 3 else ("warn" if standard >= 2 else "bad"),
        "detail": "Experience, Education and Skills headings found." if standard == 3 else f"{standard} of 3 standard headings found (Experience, Education, Skills).",
    })
    wc = resume["meta"]["wordCount"]
    checks.append({
        "label": "Extractable text",
        "status": "good" if wc > 150 else "bad",
        "detail": f"{wc} words parsed." if wc > 150 else "Very little text could be extracted.",
    })
    exp = resume.get("experience") or []
    dated = len([e for e in exp if e.get("dates")])
    checks.append({
        "label": "Chronology",
        "status": "warn" if not exp else ("good" if dated == len(exp) else ("warn" if dated else "bad")),
        "detail": "No experience entries to date." if not exp else ("All " + str(len(exp)) + " experience entries include dates." if dated == len(exp) else f"{dated} of {len(exp)} entries have parseable dates — unclear dates can break ATS timelines."),
    })
    kw_cat = next((c for c in match["categories"] if c["key"] == "keywords"), None)
    kw_score = kw_cat["score"] if kw_cat and isinstance(kw_cat["score"], (int, float)) else 0
    checks.append({
        "label": "Keyword coverage",
        "status": "good" if kw_score >= 55 else ("warn" if kw_score >= 30 else "bad"),
        "detail": f"About {kw_score}% of this posting's recurring keywords appear in your resume.",
    })
    skill_count = len(match["evidence"]["resumeSkills"])
    checks.append({
        "label": "Skill visibility",
        "status": "good" if skill_count >= 8 else ("warn" if skill_count >= 4 else "bad"),
        "detail": f"{skill_count} recognizable skills found in the text" + (" (Skills section present)." if resume.get("skillsText") else " — consider adding a Skills section so they're easy to find."),
    })
    jd_skills = [r for r in match["evidence"]["requirements"] if not r["extra"]]
    jd_hit = len([r for r in jd_skills if r["resumeCount"] > 0])
    jd_ratio = jd_hit / len(jd_skills) if jd_skills else 0
    checks.append({
        "label": "Job-specific terminology",
        "status": "good" if jd_ratio >= 0.6 else ("warn" if jd_ratio >= 0.35 else "bad"),
        "detail": f"{round(jd_ratio * 100)}% of this job's specific terms appear in your resume.",
    })
    for r in resume.get("formattingRisks") or []:
        checks.append({"label": "Formatting risk", "status": "bad" if r["severity"] == "high" else "warn", "detail": r["risk"]})
    checks.append({
        "label": "Resume length",
        "status": "good" if 250 <= wc <= 950 else "warn",
        "detail": f"{wc} words. " + ("Short resumes often lack evidence." if wc < 250 else ("Long resumes get skimmed — tighten toward the most relevant evidence." if wc > 950 else "A reasonable length for screening.")),
    })
    w = {"good": 1, "warn": 0.55, "bad": 0}
    pct = round(sum(w[ch["status"]] for ch in checks) / len(checks) * 100)
    label = "Strong" if pct >= 80 else "Adequate" if pct >= 60 else "Needs work" if pct >= 40 else "Weak"
    summary = ("Machine-readable and well structured for automated screening." if pct >= 80
               else "Mostly readable, with a few fixable issues." if pct >= 60
               else "Several issues could prevent this resume from being parsed or matched correctly.")
    return {"score": pct, "label": label, "summary": summary, "checks": checks}


def compute_keywords(resume, jd, match):
    out = {"requiredFound": [], "requiredMissing": [], "preferredFound": [], "preferredMissing": []}
    for r in match["evidence"]["requirements"]:
        item = {"term": r["label"], "jdContext": r["jdContext"], "resumeContext": r["resumeContext"],
                "resumeCount": r["resumeCount"], "extra": bool(r["extra"])}
        if r["tier"] == "preferred":
            bucket = "preferredFound" if r["resumeCount"] > 0 else "preferredMissing"
        else:
            bucket = "requiredFound" if r["resumeCount"] > 0 else "requiredMissing"
        out[bucket].append(item)
    for bucket in ("requiredMissing", "preferredMissing"):
        for item in out[bucket]:
            if item.get("jdContext"):
                ctx = item["jdContext"].strip()
                item["why"] = "“" + ctx[:150] + ("…”" if len(ctx) > 150 else "”") + " — from the job description."
            else:
                item["why"] = f"Listed under {'required' if bucket == 'requiredMissing' else 'preferred'} skills in this posting."
            item["honest"] = "Only add this if you genuinely have experience with it. If not, don't list it — address it in a cover letter or be ready to discuss adjacent experience."
    return out


# ============================================================
# Insights (port of insights.js)
# ============================================================

GENERIC_PHRASES = [
    (re.compile(r"\b(hardworking|hard.working)\b", re.I), "self-description (“hardworking”) instead of evidence"),
    (re.compile(r"\b(passionate about (technology|learning|innovation))\b", re.I), "“passionate about…” — every resume says this"),
    (re.compile(r"\b(team player)\b", re.I), "“team player” — show collaboration through an outcome instead"),
    (re.compile(r"\b(good communicator|excellent communication skills)\b", re.I), "claims of communication skill without an example"),
    (re.compile(r"\b(dynamic|results.driven|self.motivated|go.?getter)\b", re.I), "buzzword self-description (“results-driven” type)"),
    (re.compile(r"\b(responsible for)\b", re.I), "“responsible for” — describes a duty, not an outcome"),
    (re.compile(r"\b(worked on (various|multiple|several))\b", re.I), "“worked on various…” — vague, unverifiable"),
    (re.compile(r"\b(utiliz(e|ed|ing))\b", re.I), "“utilized” — usually means “used”"),
    (re.compile(r"\b(synerg(y|ies|istic))\b", re.I), "corporate filler (“synergy”)"),
    (re.compile(r"\b(thought leadership|best practices)\b", re.I), "corporate filler phrases"),
]


def _clip(s, n):
    s = str(s or "").strip()
    return (s[: n - 1].rstrip(" ,;:.-") + "…") if len(s) > n else s


def compute_insights(resume, jd, match):
    role = detect_role((match.get("role") or {}).get("label")) if match.get("role") else None
    skills = match["evidence"]["resumeSkills"]
    top_skills = [s["label"] for s in skills[:6]]
    bullets = resume.get("bullets") or []
    weak_bullets = [b for b in bullets if b["weakStart"]]
    no_metric = [b for b in bullets if not b["hasMetric"]]
    metric_bullets = [b for b in bullets if b["hasMetric"]]
    req_missing = [r for r in match["evidence"]["requirements"] if r["tier"] == "required" and r["resumeCount"] == 0 and not r["extra"]]
    exp_cat = next((c for c in match["categories"] if c["key"] == "experience"), {})
    proj_cat = next((c for c in match["categories"] if c["key"] == "projects"), {})
    kw_cat = next((c for c in match["categories"] if c["key"] == "keywords"), {})

    view = {"firstImpression": None, "attention": [], "skim": [], "concern": [], "fixFirst": []}

    fi = []
    if top_skills:
        fi.append("The skill story is clear: " + ", ".join(top_skills[:4]) + ".")
    if metric_bullets:
        fi.append(f"{len(metric_bullets)} bullet{'s' if len(metric_bullets) != 1 else ''} carry numbers — those are what a reviewer actually reads.")
    elif bullets:
        fi.append("No bullet points carry measurable results, so nothing numerically stands out in a first pass.")
    if resume.get("projects") and not resume.get("experience"):
        fi.append("Projects lead this resume — expected for a student/fresher profile, and fine.")
    title_line = f"“{jd['title']}”" if jd.get("title") else "this role"
    shape = "credible" if match["overall"] >= 70 else ("promising but thin" if match["overall"] >= 50 else "off-target")
    fi.append(f"Set against {title_line}, the overall shape reads {shape}.")
    view["firstImpression"] = " ".join(fi)

    strongest = None
    for b in bullets:
        if b["hasMetric"] and b["strongStart"]:
            if strongest is None or len(b.get("metric") or "") > len(strongest.get("metric") or ""):
                strongest = b
    if strongest:
        view["attention"].append({"text": "Strongest line: “" + _clip(strongest["text"], 120) + "”", "classification": "DIRECT EVIDENCE"})
    if resume.get("projects"):
        p = resume["projects"][0]
        view["attention"].append({"text": "Project: " + _clip(p.get("name") or "Untitled project", 70) + (f" — {len(p['bullets'])} bullet(s) of evidence." if p["bullets"] else "."), "classification": "DIRECT EVIDENCE"})
    if exp_cat.get("years") is not None:
        view["attention"].append({"text": f"About {exp_cat['years']} years of dated experience.", "classification": "DIRECT EVIDENCE"})
    certs = [_clip(re.sub(r"^[-•*\u2022]\s*", "", l), 60) for l in (resume["sectionMap"].get("certifications") or [])][:3]
    if certs:
        view["attention"].append({"text": "Certifications listed: " + "; ".join(certs) + ".", "classification": "USER-PROVIDED"})
    if not view["attention"]:
        view["attention"].append({"text": "Nothing jumps out yet — the resume states roles but shows few concrete artifacts.", "classification": "INFERRED"})

    if weak_bullets:
        view["skim"].append({"text": f"{len(weak_bullets)} bullet{'s' if len(weak_bullets) != 1 else ''} start passively (“worked on”, “responsible for”…). Reviewers skim past these.", "bullets": [_clip(b["text"], 90) for b in weak_bullets[:3]], "classification": "DIRECT EVIDENCE"})
    if len(no_metric) > len(bullets) / 2 and len(bullets) >= 4:
        view["skim"].append({"text": "Most bullets describe activity, not results — they read as a task list and get skimmed.", "classification": "INFERRED"})
    for l in (resume["sectionMap"].get("summary") or []):
        hits = [g for g in GENERIC_PHRASES if g[0].search(l)]
        if hits and len(l) > 60:
            view["skim"].append({"text": "The summary leans generic: " + hits[0][1] + ".", "classification": "DIRECT EVIDENCE"})
    if resume["meta"]["wordCount"] > 950:
        view["skim"].append({"text": f"At {resume['meta']['wordCount']} words, later sections won't be read closely.", "classification": "INFERRED"})

    if req_missing:
        names = ", ".join(r["label"] for r in req_missing[:4])
        view["concern"].append({"text": "The posting asks for " + names + ("…" if len(req_missing) > 4 else "") + " — none appear anywhere in your resume.", "classification": "MISSING"})
    if isinstance(exp_cat.get("score"), (int, float)) and exp_cat["score"] < 55:
        view["concern"].append({"text": exp_cat["detail"], "classification": "INFERRED" if exp_cat.get("years") is not None else "MISSING"})
    if isinstance(kw_cat.get("score"), (int, float)) and kw_cat["score"] < 40:
        view["concern"].append({"text": f"Only ~{kw_cat['score']}% of the posting's recurring keywords appear in your resume — automated screens may rank this low.", "classification": "INFERRED"})
    if resume.get("contact") and not resume["contact"]["hasEmail"]:
        view["concern"].append({"text": "No email address was detected — a real screen-out risk.", "classification": "DIRECT EVIDENCE"})
    if not view["concern"]:
        view["concern"].append({"text": "No structural concerns. The remaining risk is normal competition — other candidates will also match these requirements.", "classification": "INFERRED"})

    fixes = []
    if len(weak_bullets) >= 2:
        fixes.append("Rewrite passive bullets into action + result.")
    if not metric_bullets and len(bullets) >= 3:
        fixes.append("Add real, truthful numbers to at least your top bullets.")
    if req_missing:
        fixes.append("Close the biggest requirement gaps you can honestly close (" + ", ".join(r["label"] for r in req_missing[:2]) + ").")
    if isinstance(proj_cat.get("score"), (int, float)) and proj_cat["score"] < 50:
        fixes.append("Give projects real scope and outcomes.")
    view["fixFirst"] = fixes[:3]
    return view


def compute_benchmark(resume, jd, match):
    role = detect_role((match.get("role") or {}).get("label")) if match.get("role") else None
    rows = []
    for r in match["evidence"]["requirements"]:
        if r["extra"]:
            continue
        expectation = "Required by this job" if r["tier"] == "required" else "Preferred by this job"
        if r["resumeCount"] == 0:
            you = {"level": "No evidence", "pct": 0, "classification": "MISSING"}
        elif r["inBullets"]:
            you = {"level": "Strong" if r["resumeCount"] >= 3 else "Present", "pct": 85 if r["resumeCount"] >= 3 else 65, "classification": "DIRECT EVIDENCE"}
        else:
            you = {"level": "Listed only", "pct": 40, "classification": "DIRECT EVIDENCE"}
        core_note = None
        if role and role_is_core(role, r["key"], r["label"]):
            core_note = f"Core skill for {role['label']} roles (role knowledge, not from this posting)."
        rows.append({"term": r["label"], "expectation": expectation, "coreNote": core_note,
                     "you": you["level"], "pct": you["pct"], "classification": you["classification"],
                     "jdContext": r["jdContext"], "resumeContext": r["resumeContext"]})
    rows.sort(key=lambda x: x["pct"])
    return {"rows": rows, "note": "“Role expectation” comes from the job description itself; “You” comes only from your resume text. Where a row reflects general role knowledge rather than this posting, it says so."}


def compute_priorities(resume, jd, match):
    items = []
    req_missing = [r for r in match["evidence"]["requirements"] if r["tier"] == "required" and r["resumeCount"] == 0 and not r["extra"]]
    bullets = resume.get("bullets") or []
    weak_bullets = [b for b in bullets if b["weakStart"]]
    metric_bullets = [b for b in bullets if b["hasMetric"]]

    def cat(k):
        return next((c for c in match["categories"] if c["key"] == k), {})

    evid_cat, proj_cat, exp_cat, kw_cat = cat("evidence"), cat("projects"), cat("experience"), cat("keywords")

    if isinstance(evid_cat.get("score"), (int, float)) and evid_cat["score"] < 60 and bullets:
        items.append({"section": "Experience & Projects", "title": "Rewrite bullets into evidence", "why": evid_cat["detail"],
                      "what": ("Lead with the action, name the technology, and state the truthful outcome. " +
                               ("Add numbers to the bullets that currently lack them." if metric_bullets else "Right now no bullet carries a measurable result.")),
                      "weight": 90 + evid_cat["score"]})
    if req_missing:
        items.append({"section": "Skills / Keyword coverage", "title": "Surface what you already have",
                      "why": "The posting requires " + ", ".join(r["label"] for r in req_missing[:4]) + " and your resume doesn't mention " + ("them" if len(req_missing) > 1 else "it") + ".",
                      "what": "If you have used any of these — in a project, coursework, or internship — name them explicitly in context. If you haven't, don't add them; the honest gap belongs in a cover letter instead.",
                      "weight": 85 + min(15, len(req_missing) * 3)})
    if isinstance(proj_cat.get("score"), (int, float)) and proj_cat["score"] < 55:
        items.append({"section": "Projects", "title": "Make one project prove depth", "why": proj_cat["detail"],
                      "what": "Pick your most relevant project. State the problem, the stack, and the outcome in 2–3 bullets. Depth on one real project beats three shallow ones.",
                      "weight": 75 + proj_cat["score"]})
    if isinstance(exp_cat.get("score"), (int, float)) and exp_cat["score"] < 60:
        items.append({"section": "Experience",
                      "title": "Close the experience gap or reframe it" if exp_cat.get("years") is not None else "Add structure to your experience",
                      "why": exp_cat["detail"],
                      "what": ("You can't manufacture years. Make the experience you do have unambiguous: scope, ownership, tools, outcomes." if exp_cat.get("years") is not None
                               else "Add clear dates, role titles, and 2–3 outcome bullets to each experience entry."),
                      "weight": 70 + exp_cat["score"]})
    if isinstance(kw_cat.get("score"), (int, float)) and kw_cat["score"] < 45:
        items.append({"section": "Keywords", "title": "Cover the recurring terms honestly",
                      "why": f"About {kw_cat['score']}% of the posting's recurring keywords appear in your resume.",
                      "what": "For each missing term you genuinely know, work it into a bullet with context. Skip the ones you can't back up — padding is detectable in interviews.",
                      "weight": 60 + kw_cat["score"]})
    items.sort(key=lambda x: -x["weight"])
    for i, it in enumerate(items):
        it["rank"] = i + 1
    return {"items": items[:3]}


def compute_honest(resume, jd, match):
    honest = {"headline": "", "body": [], "fix": []}
    req_missing = [r for r in match["evidence"]["requirements"] if r["tier"] == "required" and r["resumeCount"] == 0 and not r["extra"]]
    o = match["overall"]
    if o >= 80:
        honest["headline"] = "You're ready to submit this."
        honest["body"].append("The match is strong and the remaining gaps are minor. Submit, and focus your energy on interview prep rather than more editing.")
    elif o >= 65:
        honest["headline"] = "Close, but not clean yet."
        honest["body"].append("You have a real foundation for this role. What's holding the application back is precision, not substance: the posting asks for specific things your resume doesn't currently name.")
    elif o >= 45:
        honest["headline"] = "You're not ready to submit this version yet."
        honest["body"].append("Your biggest problem isn't formatting — it's evidence. The posting names specific requirements your resume doesn't currently demonstrate.")
        if req_missing:
            honest["body"].append("Missing from your resume: " + ", ".join(r["label"] for r in req_missing[:5]) + ".")
    else:
        honest["headline"] = "This application, as it stands, won't get considered."
        honest["body"].append("The gap between this job's requirements and your resume is too wide for edits to fix. Either target a closer role, or build the missing experience and re-run this analysis.")
        if req_missing:
            honest["body"].append("The core gaps: " + ", ".join(r["label"] for r in req_missing[:5]) + ".")
    priorities = compute_priorities(resume, jd, match)
    honest["fix"] = [p["title"] for p in priorities["items"][:3]]
    honest["note"] = "Direct by design — no flattery, no exaggeration. Every point above is checkable against your resume and the posting."
    return honest


def compute_final(match, priorities):
    verdicts = [(80, "Strong foundation. Application-ready."), (65, "Solid foundation. Not application-ready yet."),
                (45, "Real gaps. Fix before you apply."), (0, "Off-target for this role right now.")]
    label = verdicts[-1][1]
    for mn, lab in verdicts:
        if match["overall"] >= mn:
            label = lab
            break
    return {"match": match["overall"], "verdict": label,
            "fixThree": [p["title"] for p in priorities["items"]],
            "disclaimer": "An estimate based on this posting and your resume — not a prediction of hiring outcomes."}


# ============================================================
# Rewrites + humanizer (port of rewrite.js)
# ============================================================

HUMANIZE_RULES = [
    (re.compile(r"\b(leverag(e|ed|ing))\b", re.I), "use"),
    (re.compile(r"\butiliz(e|ed|ing)\b", re.I), "use"),
    (re.compile(r"\bsynerg(y|ies|istic)\b", re.I), "collaboration"),
    (re.compile(r"\b(seamlessly|seamless)\b", re.I), ""),
    (re.compile(r"\b(cutting.edge|state.of.the.art)\b", re.I), "modern"),
    (re.compile(r"\b(world.class|best.in.class|industry.leading)\b", re.I), ""),
    (re.compile(r"\b(robust)\b", re.I), "reliable"),
    (re.compile(r"\bholistic(ally)?\b", re.I), ""),
    (re.compile(r"\bdeliv(er|ered|ering) (value|impact)\b", re.I), "improved results"),
    (re.compile(r"\b(drive|drove|driving) (excellence|innovation|success)\b", re.I), "improved results"),
    (re.compile(r"\bpassionate about\b", re.I), "focused on"),
    (re.compile(r"\bresults.driven\b", re.I), ""),
    (re.compile(r"\bself.starter\b", re.I), ""),
    (re.compile(r"\bteam player\b", re.I), ""),
    (re.compile(r"\bhardworking\b", re.I), ""),
    (re.compile(r"\bdetail.oriented\b", re.I), ""),
    (re.compile(r"\bhighly (motivated|skilled|experienced)\b", re.I), ""),
    (re.compile(r"\b(extremely|incredibly|highly) (effective|efficient|proficient)\b", re.I), "effective"),
    (re.compile(r"\bin ?order ?to\b", re.I), "to"),
    (re.compile(r"\bdue to the fact that\b", re.I), "because"),
    (re.compile(r"\bwith respect to\b", re.I), "for"),
    (re.compile(r"\ba wide (range|variety) of\b", re.I), "several"),
    (re.compile(r"\bvarious (tasks|responsibilities|duties)\b", re.I), "core tasks"),
    (re.compile(r"\b(responsibilities included|duties included)\b", re.I), "handled"),
    (re.compile(r"\bplayed a (key|vital|crucial|pivotal) role in\b", re.I), "led"),
    (re.compile(r"\binstrumental in\b", re.I), "drove"),
    (re.compile(r"\bsuccessfully\b", re.I), ""),
    (re.compile(r"\beffectively\b", re.I), ""),
    (re.compile(r"\befficiently\b", re.I), ""),
    (re.compile(r"\bactively (participated|involved)\b", re.I), "took part"),
    (re.compile(r"\bhelped (to|in)? ?(facilitate)\b", re.I), "supported"),
    (re.compile(r"\bfacilitated\b", re.I), "ran"),
    (re.compile(r"\bendeavou?rs?\b", re.I), "work"),
    (re.compile(r"\butili[sz]ing\b", re.I), "using"),
]

GERUND_PAST = {
    "cleaning": "Cleaned", "analyzing": "Analyzed", "analysing": "Analysed",
    "building": "Built", "developing": "Developed", "designing": "Designed",
    "managing": "Managed", "creating": "Created", "testing": "Tested",
    "deploying": "Deployed", "writing": "Wrote", "maintaining": "Maintained",
    "improving": "Improved", "supporting": "Supported", "leading": "Led",
    "handling": "Handled", "automating": "Automated", "migrating": "Migrated",
    "debugging": "Debugged", "documenting": "Documented", "monitoring": "Monitored",
    "training": "Trained", "evaluating": "Evaluated", "optimizing": "Optimized",
}


def humanize(text):
    t = str(text or "").strip()
    for pattern, to in HUMANIZE_RULES:
        t = pattern.sub(to, t)
    t = re.sub(r"\s{2,}", " ", t)
    t = re.sub(r"\s+([,.;:])", r"\1", t)
    t = re.sub(r"^[,;:.\s]+", "", t)
    t = re.sub(r"([,;:]){2,}", r"\1", t).strip()
    if t:
        t = t[0].upper() + t[1:]
    return t


def _pick_verb(low_text, tech_label):
    if re.search(r"\bmachine learning|deep learning|neural|ml model", low_text):
        return "Developed"
    if re.search(r"\bmodel|predict|forecast|classif", low_text):
        return "Developed"
    if re.search(r"\bdashboard|report|visual", low_text):
        return "Built"
    if re.search(r"\btest|qa|bug", low_text):
        return "Automated"
    if re.search(r"\bdeploy|release|ci|cd\b", low_text):
        return "Shipped"
    if re.search(r"\bdata|pipeline|etl", low_text):
        return "Processed"
    if re.search(r"\bteam|mentor|lead|junior", low_text):
        return "Led"
    return "Built"


def rewrite_bullet(bullet, jd=None):
    orig = bullet["text"].strip()
    low = norm(orig)

    if bullet["strongStart"] and bullet["hasMetric"] and not bullet["long"] and not bullet["short"]:
        return None

    rewritten = None
    if WEAK_STARTS.search(orig):
        stripped = WEAK_STARTS.sub("", orig, count=1)
        stripped = re.sub(r"^\s*(on|with|in|for|the)\s+", "", stripped, flags=re.I)
        stripped = stripped.lstrip()

        def pastify(m):
            w = m.group(0)
            past = GERUND_PAST.get(w.lower())
            if not past:
                return w
            return past[0].lower() + past[1:]  # lowercase mid-sentence; humanize recaps

        pastified = re.sub(r"\b([a-zA-Z]+ing)\b", pastify, stripped)
        first_m = re.match(r"^[a-zA-Z]+", stripped)
        first_word = first_m.group(0).lower() if first_m else ""
        if GERUND_PAST.get(first_word):
            rewritten = pastified
        elif first_word.endswith("ing"):
            return None  # un-conjugatable gerund — offer nothing
        else:
            verb = _pick_verb(norm(pastified), None)
            rewritten = verb + " " + stripped
    elif re.match(r"^responsible for", low):
        rest = re.sub(r"^responsible for\s*", "", orig, flags=re.I)
        m = re.match(r"^[a-zA-Z]+", rest)
        first_raw = m.group(0).lower() if m else ""
        if GERUND_PAST.get(first_raw):
            rewritten = re.sub(r"^[a-zA-Z]+", GERUND_PAST[first_raw], rest, count=1)
        else:
            rewritten = "Owned " + rest
    elif re.match(r"^(assisted|helped)\b", low):
        rewritten = "Supported " + re.sub(r"^(assisted|helped)( with| in)?\s*", "", orig, flags=re.I)
    elif bullet["long"]:
        cut = re.sub(r"\b(in order to|so as to)\b", "to", orig, flags=re.I)
        cut = re.sub(r"\b(responsibilities included|duties included)\b", "handled", cut, flags=re.I)
        cut = re.sub(r"\b(daily|regularly|consistently|on a (daily|regular) basis)\b,?", "", cut, flags=re.I)
        cut = re.sub(r"\b(as well as)\b", "and", cut, flags=re.I)
        cut = re.sub(r"\b(along with)\b", "with", cut, flags=re.I)
        cut = re.sub(r"\s{2,}", " ", cut).strip()
        words = cut.split()
        if len(words) > 34:
            cut = " ".join(words[:32]).rstrip(",;:") + "."
        rewritten = cut
    else:
        return None

    if not rewritten or norm(rewritten) == low:
        return None
    rewritten = humanize(rewritten)
    if not rewritten or norm(rewritten) == low:
        return None
    if len(rewritten.split()) < 5:
        return None

    changes = []
    if bullet["weakStart"]:
        changes.append("replaced the passive opener")
    if bullet["long"]:
        changes.append("cut filler")
    if bullet["hasMetric"]:
        changes.append("kept your real number" + (f" ({bullet['metric']})" if bullet["metric"] else ""))
    else:
        changes.append("no numbers were added — none existed to use")
    return {"before": orig, "after": rewritten, "note": ", ".join(changes)}


def build_rewrites(resume, jd):
    offers = []
    bullets = resume.get("bullets") or []
    for b in bullets:
        offer = rewrite_bullet(b, jd)
        if offer:
            offers.append(offer)
    return offers


def rewrite_summary(resume, jd, match):
    lines = resume["sectionMap"].get("summary") or []
    if not lines:
        return None
    original = " ".join(lines).strip()
    if not original or len(original) < 40:
        return None

    parts = []
    edu = (resume.get("education") or [None])[0]
    skills = [s["label"] for s in (match["evidence"]["resumeSkills"] or [])[:4]]
    exp_cat = next((c for c in match["categories"] if c["key"] == "experience"), {})
    years = exp_cat.get("years")

    def title_case(s):
        return " ".join(w[0].upper() + w[1:] for w in str(s or "").split())

    if edu and edu.get("degree"):
        inst = (" student at " + edu["institution"]) if edu.get("institution") else ""
        parts.append(title_case(edu["degree"]) + inst)
    elif years is not None and years > 0:
        parts.append(f"Professional with about {round(years)} years of experience")
    elif resume.get("projects"):
        n = len(resume["projects"])
        parts.append(f"Early-career profile built on {n} hands-on project{'s' if n != 1 else ''}")
    if not parts:
        return None
    if skills:
        parts.append("working with " + ", ".join(skills))
    if jd and jd.get("title"):
        parts.append(f"targeting {jd['title']} roles")
    after = humanize(", ".join(parts)) + "."
    if norm(after) == norm(original):
        return None
    return {"before": original, "after": humanize(", ".join(parts)) + ".",
            "note": "Rebuilt from facts already in your resume: education, dated experience and named skills only."}


# ============================================================
# Full pipeline (port of pipeline.js runAnalysis)
# ============================================================

ANALYSIS_STAGES = [
    {"key": "parse", "label": "Reading your resume"},
    {"key": "jd", "label": "Parsing the job description"},
    {"key": "match", "label": "Scoring the match"},
    {"key": "ats", "label": "Running ATS checks"},
    {"key": "keywords", "label": "Analyzing keywords"},
    {"key": "insights", "label": "Reviewing as a hiring manager"},
    {"key": "rewrites", "label": "Writing honest rewrites"},
]


def run_analysis(resume_text, resume_meta, job_input):
    job_input = job_input or {}
    jd_text = str(job_input.get("text") or "").strip()
    if len(jd_text) < 80:
        return {"error": "The job description is too short to analyze. Paste the full posting."}

    resume = parse_resume(resume_text, resume_meta or {})
    jd = parse_job_description(jd_text, {
        "mode": job_input.get("mode", "text"),
        "title": job_input.get("title"),
        "company": job_input.get("company"),
        "url": job_input.get("url"),
    })
    match = compute_match(resume, jd)
    ats = compute_ats(resume, jd, match)
    keywords = compute_keywords(resume, jd, match)
    insights = compute_insights(resume, jd, match)
    benchmark = compute_benchmark(resume, jd, match)
    honest = compute_honest(resume, jd, match)
    priorities = compute_priorities(resume, jd, match)
    rewrites = build_rewrites(resume, jd)
    summary_rewrite = rewrite_summary(resume, jd, match)
    final = compute_final(match, priorities)

    return {
        "match": match, "ats": ats, "keywords": keywords, "insights": insights,
        "benchmark": benchmark, "honest": honest, "priorities": priorities,
        "rewrites": rewrites, "summaryRewrite": summary_rewrite, "final": final,
        "generatedAt": datetime.utcnow().isoformat() + "Z",
    }
