const { Octokit } = require("@octokit/core");
const fetch = require("node-fetch");

// Replace with your GitHub token and Hugging Face API token
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const HF_TOKEN = process.env.HF_TOKEN;

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const headers = {
  Authorization: `Bearer ${HF_TOKEN}`,
  "Content-Type": "application/json",
};

async function fetchPullRequestDiff(owner, repo, pull_number) {
  const response = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
    owner,
    repo,
    pull_number,
  });
  const diff_url = response.data.diff_url;
  const diff = await fetch(diff_url).then((res) => res.text());
  return diff;
}

async function getCodeReviewFromCodeLlama(diff) {
  const payload = {
    inputs: `Please review the following code diff and provide suggestions:\n${diff}`,
  };

  const response = await fetch("https://api-inference.huggingface.co/models/codellama/CodeLlama-7b-hf", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  return data[0]?.generated_text || "No review generated.";
}

async function postReviewComment(owner, repo, issue_number, body) {
  await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
    owner,
    repo,
    issue_number,
    body,
  });
}

(async () => {
  const owner = "Nandees13";
  const repo = "HPE";
  const pull_number = 2;

  try {
    const diff = await fetchPullRequestDiff(owner, repo, pull_number);
    const review = await getCodeReviewFromCodeLlama(diff);
    await postReviewComment(owner, repo, pull_number, review);
  } catch (err) {
    console.error("Error:", err.message);
  }
})();
