/* ============================================================
   JobProof AI — js/taxonomy.js
   Evidence vocabulary: what we can honestly detect in text.
   Every matcher is conservative — a match requires the actual
   term (or a listed alias) to appear in the source text.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;

  function esc(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Build a wordish regex for a term with optional alias list.
  function buildRe(aliases, extra) {
    var parts = aliases.map(esc).concat(extra || []);
    return new RegExp("(?<![a-z0-9+#./-])(" + parts.join("|") + ")(?![a-z0-9+#])", "gi");
  }

  function skill(key, label, aliases, extra) {
    return { key: key, label: label, re: buildRe(aliases, extra) };
  }

  /* ---------------- Programming languages ---------------- */

  var LANGUAGES = [
    skill("python", "Python", ["python"]),
    skill("java", "Java", ["java"]),
    skill("javascript", "JavaScript", ["javascript", "java script", "js\\b"], ["js"]),
    skill("typescript", "TypeScript", ["typescript", "type script", "ts\\b"], ["ts"]),
    skill("csharp", "C#", ["c#\\b", "c sharp", "csharp"]),
    skill("cpp", "C++", ["c\\+\\+", "cpp"]),
    skill("c_lang", "C", ["\\bc\\b"]),
    skill("go_lang", "Go", ["golang", "\\bgo\\b(?!al)"]),
    skill("rust", "Rust", ["rust"]),
    skill("kotlin", "Kotlin", ["kotlin"]),
    skill("swift", "Swift", ["swift"]),
    skill("php", "PHP", ["php"]),
    skill("ruby", "Ruby", ["ruby", "ruby on rails"]),
    skill("scala", "Scala", ["scala"]),
    skill("r_lang", "R", ["\\br\\b"]),
    skill("matlab", "MATLAB", ["matlab"]),
    skill("sql", "SQL", ["sql"], ["mysql", "postgresql", "postgres", "sqlite", "t-sql", "pl/sql"]),
    skill("html", "HTML", ["html5?", "xhtml"]),
    skill("css", "CSS", ["css3?", "scss", "sass"]),
    skill("bash", "Shell scripting", ["bash", "shell script", "zsh", "powershell", "command line", "command-line"]),
    skill("vba", "VBA", ["vba\\b"]),
  ];

  /* ---------------- Frameworks & libraries ---------------- */

  var FRAMEWORKS = [
    skill("react", "React", ["react\\.?js", "react"]),
    skill("nextjs", "Next.js", ["next\\.?js"]),
    skill("vue", "Vue", ["vue\\.?js", "vue"]),
    skill("angular", "Angular", ["angular\\.?js", "angular"]),
    skill("nodejs", "Node.js", ["node\\.?js", "node"]),
    skill("express", "Express", ["express\\.?js", "express"]),
    skill("django", "Django", ["django"]),
    skill("flask", "Flask", ["flask"]),
    skill("fastapi", "FastAPI", ["fastapi", "fast api"]),
    skill("spring", "Spring", ["spring boot", "spring"]),
    skill("dotnet", ".NET", ["\\.net\\b", "dotnet", "asp\\.net"]),
    skill("laravel", "Laravel", ["laravel"]),
    skill("tailwind", "Tailwind CSS", ["tailwind"]),
    skill("bootstrap", "Bootstrap", ["bootstrap"]),
    skill("pytorch", "PyTorch", ["pytorch", "torch"]),
    skill("tensorflow", "TensorFlow", ["tensorflow", "tf\\.keras"]),
    skill("keras", "Keras", ["keras"]),
    skill("sklearn", "scikit-learn", ["scikit-learn", "scikit learn", "sklearn"]),
    skill("pandas", "pandas", ["pandas"]),
    skill("numpy", "NumPy", ["numpy"]),
    skill("scipy", "SciPy", ["scipy"]),
    skill("opencv", "OpenCV", ["opencv"]),
    skill("huggingface", "Hugging Face", ["hugging ?face", "transformers(?! model)"]),
    skill("spark", "Apache Spark", ["(apache )?spark", "pyspark"]),
    skill("hadoop", "Hadoop", ["hadoop"]),
    skill("kafka", "Kafka", ["kafka"]),
    skill("airflow", "Airflow", ["airflow"]),
    skill("dbt", "dbt", ["\\bdbt\\b"]),
    skill("powerbi", "Power BI", ["power ?bi"]),
    skill("tableau", "Tableau", ["tableau"]),
    skill("flutter", "Flutter", ["flutter"]),
    skill("reactnative", "React Native", ["react native"]),
    skill("android", "Android", ["android"]),
    skill("ios", "iOS", ["ios\\b"]),
  ];

  /* ---------------- Tools, infra & platforms ---------------- */

  var TOOLS = [
    skill("git", "Git", ["git\\b"], ["github", "gitlab", "bitbucket", "version control"]),
    skill("docker", "Docker", ["docker", "containers?"]),
    skill("kubernetes", "Kubernetes", ["kubernetes", "\\bk8s\\b"]),
    skill("aws", "AWS", ["aws", "amazon web services"], ["ec2", "\\bs3\\b", "lambda", "dynamodb", "sagemaker"]),
    skill("azure", "Azure", ["azure", "microsoft azure"]),
    skill("gcp", "Google Cloud", ["google cloud", "\\bgcp\\b", "bigquery", "vertex ai"]),
    skill("ci_cd", "CI/CD", ["ci/cd", "continuous integration", "continuous delivery", "continuous deployment", "jenkins", "github actions", "gitlab ci", "circleci"]),
    skill("terraform", "Terraform", ["terraform", "infrastructure as code"]),
    skill("linux", "Linux", ["linux", "ubuntu", "unix"]),
    skill("jira", "Jira", ["\\bjira\\b"]),
    skill("rest", "REST APIs", ["rest(api)?s?\\b", "restful"]),
    skill("graphql", "GraphQL", ["graphql"]),
    skill("microservices", "Microservices", ["micro ?services?"]),
    skill("redis", "Redis", ["redis"]),
    skill("mongodb", "MongoDB", ["mongodb", "mongo"]),
    skill("postgresql", "PostgreSQL", ["postgresql", "postgres"]),
    skill("mysql", "MySQL", ["mysql"]),
    skill("elasticsearch", "Elasticsearch", ["elastic ?search", "opensearch"]),
    skill("snowflake", "Snowflake", ["snowflake"]),
    skill("excel", "Excel", ["(ms |microsoft )?excel", "google sheets", "spreadsheets?", "pivot tables?", "vlookup"]),
    skill("powerpoint", "PowerPoint", ["(ms |microsoft )?powerpoint", "presentations?"]),
    skill("word", "Word", ["(ms |microsoft )?word\\b", "documentation"]),
    skill("figma", "Figma", ["figma"]),
    skill("postman", "Postman", ["postman"]),
    skill("agile", "Agile/Scrum", ["agile", "scrum", "kanban", "sprints?"]),
    skill("mlflow", "MLflow", ["mlflow"]),
    skill("streamlit", "Streamlit", ["streamlit"]),
    skill("powerautomate", "Power Automate", ["power automate", "powerapps", "power platform"]),
  ];

  /* ---------------- Data & ML concepts ---------------- */

  var MLDATA = [
    skill("machine_learning", "Machine Learning", ["machine learning", "\\bml\\b", "predictive model"]),
    skill("deep_learning", "Deep Learning", ["deep learning", "neural networks?"]),
    skill("nlp", "NLP", ["\\bnlp\\b", "natural language processing", "text classification", "sentiment analysis"]),
    skill("computer_vision", "Computer Vision", ["computer vision", "\\bcv\\b models?", "image (classification|recognition|segmentation)"]),
    skill("llm", "LLMs", ["\\bllms?\\b", "large language models?", "gpt", "\\bbert\\b", "prompt engineering", "rag\\b", "retrieval.augmented"]),
    skill("data_analysis", "Data Analysis", ["data analysis", "data analytics", "analyzing data", "exploratory data", "\\beda\\b", "data cleaning", "data wrangling", "statistical analysis"]),
    skill("statistics", "Statistics", ["statistic(al|s)?", "regression", "hypothesis test", "a/b test", "probability"]),
    skill("data_viz", "Data Visualization", ["data visuali[sz]ation", "dashboards?", "matplotlib", "seaborn", "plotly", "charts?"]),
    skill("data_engineering", "Data Engineering", ["data pipelines?", "etl", "elt", "data warehouse", "data modeling"]),
    skill("mlops", "MLOps", ["mlops", "model deployment", "model serving", "model monitoring", "deployment of (ml )?models?", "deployed (models?|ml)"]),
    skill("feature_eng", "Feature Engineering", ["feature engineering", "feature selection", "feature extraction"]),
    skill("recommendation", "Recommender Systems", ["recommend(er|ation) systems?", "collaborative filtering"]),
    skill("time_series", "Time Series", ["time series", "forecasting"]),
    skill("sql_analytics", "SQL Analytics", ["\\bsql\\b"]),
    skill("big_data", "Big Data", ["big data", "large (scale |)datasets?", "distributed (computing|data)"]),
    skill("experimentation", "Experimentation", ["a/b tests?", "experiment(s|ation)"]),
    skill("optimization", "Optimization", ["optimi[sz]ation", "hyperparameter"]),
  ];

  /* ---------------- Business & domain ---------------- */

  var DOMAIN = [
    skill("finance", "Finance domain", ["financial (modeling|analysis|data)", "fintech", "banking", "credit risk", "trading"]),
    skill("healthcare", "Healthcare domain", ["healthcare", "clinical", "medical (data|records)", "patient"]),
    skill("ecommerce", "E-commerce domain", ["e-?commerce", "retail", "marketplace"]),
    skill("marketing", "Marketing analytics", ["marketing (analytics|data|campaigns?)", "seo\\b", "customer segmentation", "churn"]),
    skill("product_mgmt", "Product sense", ["product requirements", "roadmap", "stakeholder", "cross-functional", "user research", "user stories"]),
    skill("teaching", "Teaching/Mentoring", ["mentored", "taught", "trained", "tutor", "workshops?", "led a team", "team lead"]),
    skill("writing", "Technical writing", ["documented", "documentation", "technical writing", "blog posts?", "articles?"]),
    skill("research", "Research", ["research (paper|experience|project|assistant)", "published", "\\bthesis\\b", "\\bpatent"]),
  ];

  /* ---------------- Soft skills (labelled as soft signals) ---------------- */

  var SOFT = [
    "communication", "leadership", "teamwork", "collaboration", "problem.solving",
    "critical thinking", "time management", "adaptability", "ownership", "mentoring",
    "presentation", "stakeholder management", "attention to detail", "self.starter",
  ];

  /* ---------------- All technical skills, flattened ---------------- */

  var ALL = [].concat(LANGUAGES, FRAMEWORKS, TOOLS, MLDATA, DOMAIN);

  function matchList(text, list) {
    var out = [];
    var t = U.norm(text);
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      s.re.lastIndex = 0;
      var m = s.re.exec(t);
      if (m) {
        // Capture surrounding context for evidence display.
        var idx = m.index;
        var start = Math.max(0, t.lastIndexOf(" ", Math.max(0, idx - 90)));
        var end = t.indexOf(".", idx + m[0].length);
        if (end === -1 || end - idx > 160) end = Math.min(t.length, idx + 170);
        out.push({
          key: s.key,
          label: s.label,
          count: (t.match(s.re) || []).length,
          ctx: t.slice(start, end).trim(),
        });
      }
    }
    out.sort(function (a, b) {
      return b.count - a.count;
    });
    return out;
  }

  var TAX = {
    LANGUAGES: LANGUAGES,
    FRAMEWORKS: FRAMEWORKS,
    TOOLS: TOOLS,
    MLDATA: MLDATA,
    DOMAIN: DOMAIN,
    ALL: ALL,
    SOFT: SOFT,
    buildRe: buildRe,
    esc: esc,

    matchAll: function (text) {
      return matchList(text, ALL);
    },
    matchLangs: function (text) {
      return matchList(text, LANGUAGES);
    },
    matchFrameworks: function (text) {
      return matchList(text, FRAMEWORKS);
    },
    matchTools: function (text) {
      return matchList(text, TOOLS);
    },
    matchML: function (text) {
      return matchList(text, MLDATA);
    },
    matchDomain: function (text) {
      return matchList(text, DOMAIN);
    },

    findSoft: function (text) {
      var t = U.norm(text);
      var found = [];
      SOFT.forEach(function (s) {
        var re = new RegExp("(?<![a-z])" + s, "g");
        if (re.test(t)) found.push(s.replace(/\\./g, " "));
      });
      return found;
    },

    // Generic matcher for arbitrary JD keywords (e.g. "Kafka", "A/B testing").
    matchKeyword: function (text, keyword) {
      var t = U.norm(text);
      var kw = U.norm(keyword).trim();
      if (!kw) return 0;
      var re = buildRe([kw]);
      re.lastIndex = 0;
      var m = t.match(re);
      return m ? m.length : 0;
    },

    evidenceAround: function (text, keyword) {
      var t = U.norm(text);
      var re = buildRe([U.norm(keyword).trim()]);
      re.lastIndex = 0;
      var m = re.exec(t);
      if (!m) return null;
      var idx = m.index;
      var start = Math.max(0, t.lastIndexOf(" ", Math.max(0, idx - 90)));
      var end = t.indexOf(".", idx + m[0].length);
      if (end === -1 || end - idx > 170) end = Math.min(t.length, idx + 180);
      return t.slice(start, end).trim();
    },
  };

  JP.TAX = TAX;
})();
