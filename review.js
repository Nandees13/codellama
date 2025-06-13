const fetch = require('node-fetch');
const { Octokit } = require("@octokit/core");

// GitHub and Hugging Face tokens from GitHub Actions secrets
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const HF_TOKEN = process.env.HF_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;
const REPO = process.env.GITHUB_REPOSITORY;

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
  request: { fetch },
});

// Split owner/repo
const [owner, repo] = REPO.split("/");

// Fetch PR diff
async function getPRDiff() {
  const response = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
    owner,
    repo,
    pull_number: PR_NUMBER
  });

  const diff_url = response.data.diff_url;
  const diffResponse = await fetch(diff_url);
  const diff = await diffResponse.text();

  return diff;
}

// Call HuggingFace Inference API (Code LLaMA)
async function getCodeReviewFromLlama(diff) {
  const response = await fetch("https://api-inference.huggingface.co/models/meta-llama/Llama-3.1-8B-Instruct", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: `Summarize the following GitHub pull request in a professional tone. Provide:

1. **PR Title** – Suggest a concise and meaningful title for this change.
2. **Author Name** – If not available, state "Unknown".
3. **Key Comments** – Mention any significant reason behind the change, issues addressed, or observations of duplication/conflict.
4. **Diff Summary** – List the files and lines changed, highlighting important code additions or removals.
5. **Final Summary** – A clear explanation of what the pull request accomplishes or introduces. diff:\n\n${diff}\n\nGive concise feedback in bullet points.`,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`HF API error: ${err}`);
  }

  const result = await response.json();
  return result[0].generated_text || "No feedback generated.";
}

// Post comment to GitHub PR
async function postReviewComment(feedback) {
  await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
    owner,
    repo,
    issue_number: PR_NUMBER,
    body: `### 🦙 CodeLLaMA Review\n\n${feedback}`
  });
}

// Main handler
(async () => {
  try {
    const diff = await getPRDiff();
    const feedback = await getCodeReviewFromLlama(diff);
    await postReviewComment(feedback);
    console.log("✅ Review comment posted.");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
})();
