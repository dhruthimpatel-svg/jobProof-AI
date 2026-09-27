/* ============================================================
   JobProof AI — js/roles.js
   Lightweight role profiles. They only do two honest things:
   (1) recognise common role families from the job title,
   (2) note which skill categories that family typically treats
       as core vs. differentiating — used as benchmark context.
   They are explicitly labelled as role knowledge, never as
   statistics about real candidates.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;

  function re(pattern) {
    return new RegExp(pattern, "i");
  }

  var ROLES = [
    {
      key: "ml_engineer",
      label: "ML Engineer",
      match: re("\\b(machine learning|ml|ai/ ?ml|deep learning|ai)\\s+(engineer|developer|specialist)"),
      core: ["python", "machine_learning", "deep_learning", "mlops", "statistics", "pytorch", "tensorflow"],
      good: ["sql", "docker", "aws", "llm", "nlp", "computer_vision", "spark", "feature_eng", "experimentation"],
      emphasis: { skills: 1.15, projects: 1.3, evidence: 1.25 },
    },
    {
      key: "data_scientist",
      label: "Data Scientist",
      match: re("\\bdata science|\\bdata scientist"),
      core: ["python", "machine_learning", "statistics", "sql_analytics", "data_analysis"],
      good: ["deep_learning", "experimentation", "data_viz", "spark", "cloud (aws|gcp|azure) domain", "nlp", "optimization", "research"],
      emphasis: { skills: 1.1, projects: 1.2, evidence: 1.15 },
    },
    {
      key: "data_analyst",
      label: "Data Analyst",
      match: re("\\bdata analyst|\\bbusiness intelligence|\\bbi analyst"),
      core: ["sql_analytics", "excel", "data_viz", "data_analysis", "statistics"],
      good: ["python", "powerbi", "tableau", "statistics", "experimentation", "finance", "marketing"],
      emphasis: { skills: 1.1, experience: 1.15 },
    },
    {
      key: "data_engineer",
      label: "Data Engineer",
      match: re("\\bdata engineer"),
      core: ["python", "sql", "data_engineering", "spark", "etl pipelines"],
      good: ["aws", "gcp", "azure", "kafka", "airflow", "snowflake", "docker", "dbt"],
      emphasis: { skills: 1.15 },
    },
    {
      key: "software_engineer",
      label: "Software Engineer",
      match: re("\\b(software|sde|sdet)\\s*(engineer|developer)|\\bdeveloper\\b"),
      core: ["data structures", "algorithms", "problem.solving", "version control"],
      good: ["microservices", "ci_cd", "docker", "testing", "system design"],
      emphasis: {},
    },
    {
      key: "frontend_engineer",
      label: "Frontend Engineer",
      match: re("\\bfront.?end|\\bui (developer|engineer)"),
      core: ["javascript", "react", "css", "html"],
      good: ["typescript", "nextjs", "testing", "figma", "accessibility"],
      emphasis: { projects: 1.2 },
    },
    {
      key: "backend_engineer",
      label: "Backend Engineer",
      match: re("\\bback.?end"),
      core: ["rest", "microservices", "sql", "databases"],
      good: ["docker", "kubernetes", "ci_cd", "redis", "kafka", "graphql"],
      emphasis: { skills: 1.1 },
    },
    {
      key: "fullstack_engineer",
      label: "Full-Stack Engineer",
      match: re("\\bfull.?stack"),
      core: ["javascript", "react", "nodejs", "sql"],
      good: ["typescript", "docker", "aws", "ci_cd", "nextjs"],
      emphasis: { projects: 1.15 },
    },
    {
      key: "devops_engineer",
      label: "DevOps / SRE",
      match: re("\\bdevops|\\bsre\\b|\\bsite reliability|\\bplatform engineer|\\bcloud engineer"),
      core: ["linux", "docker", "kubernetes", "ci_cd", "terraform"],
      good: ["aws", "gcp", "azure", "python", "monitoring"],
      emphasis: { skills: 1.15, experience: 1.1 },
    },
    {
      key: "product_manager",
      label: "Product Manager",
      match: re("\\bproduct (manager|owner)"),
      core: ["product_mgmt", "stakeholder management", "roadmap"],
      good: ["data_analysis", "sql_analytics", "agile", "experimentation"],
      emphasis: { experience: 1.25, responsibilities: 1.2 },
    },
    {
      key: "business_analyst",
      label: "Business Analyst",
      match: re("\\bbusiness analyst|\\bba\\b"),
      core: ["excel", "data_analysis", "requirements", "stakeholder management"],
      good: ["sql_analytics", "powerbi", "tableau", "agile"],
      emphasis: { experience: 1.15 },
    },
    {
      key: "qa_engineer",
      label: "QA Engineer",
      match: re("\\b(qa|quality assurance|test)\\s*(engineer|analyst)?"),
      core: ["testing", "automation", "selenium"],
      good: ["python", "java", "ci_cd", "agile"],
      emphasis: {},
    },
    {
      key: "designer",
      label: "Designer",
      match: re("\\b(ui|ux|product) designer|\\bdesigner\\b"),
      core: ["figma", "user research", "prototyping"],
      good: ["design systems", "accessibility", "html", "usability testing"],
      emphasis: { projects: 1.3 },
    },
    {
      key: "project_manager",
      label: "Project Manager",
      match: re("\\bproject manager|\\bscrum master|\\bprogram manager"),
      core: ["agile", "stakeholder management", "planning"],
      good: ["jira", "risk management", "reporting"],
      emphasis: { experience: 1.3, responsibilities: 1.15 },
    },
  ];

  var TAX = JP.TAX;

  var ROLE_HINTS = {
    detect: function (titleText) {
      var t = JP.util.norm(titleText || "");
      for (var i = 0; i < ROLES.length; i++) {
        if (ROLES[i].match.test(t)) return ROLES[i];
      }
      return null;
    },

    all: function () {
      return ROLES;
    },

    // True if the given taxonomy key belongs to this role's core set
    // (by key name or by fuzzy label containment).
    isCore: function (role, skillKey, skillLabel) {
      if (!role) return false;
      return role.core.some(function (c) {
        return c === skillKey || JP.util.norm(skillLabel).indexOf(JP.util.norm(c)) !== -1;
      });
    },
  };

  JP.ROLE_HINTS = ROLE_HINTS;
})();
