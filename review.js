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
  const response = await fetch("https://api-inference.huggingface.co/models/codellama/CodeLlama-7b-Instruct-hf", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: `Review the following GitHub pull request diff:\n\n${diff}\n\nGive concise feedback in bullet points.`,
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
