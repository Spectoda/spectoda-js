const axios = require("axios");
const { execSync } = require("child_process");

const TARGET_CHANNEL_ID = "C05GTKQ5JHW"; // #monorepo-commits
const ACCESS_TOKEN = process.env.SCREAM_COMMITS_SLACK_ID;

const githubProject = "https://github.com/Spectoda/spectoda-js";

const slackApi = axios.create({
  baseURL: "https://slack.com/api",
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
});

async function postCommitToSlack() {
  try {
    // Get the most recent commit message, author, commit hash and branch name
    const commitMessage = execSync("git log -1 --pretty=%B", {
      encoding: "utf8",
    });
    const commitAuthor = execSync('git log -1 --pretty=format:"%an"', {
      encoding: "utf8",
    });
    const commitHash = execSync('git log -1 --pretty=format:"%H"', {
      encoding: "utf8",
    });

    let branchName = execSync("git branch --show-current", {
      encoding: "utf8",
    }).trim();

    // Handle detached head
    if (!branchName) {
      branchName = execSync("git name-rev --name-only HEAD", {
        encoding: "utf8",
      }).trim();
    }

    let tagName;
    try {
      tagName = execSync("git describe --tags --exact-match", {
        encoding: "utf8",
      }).trim();
    } catch (error) {
      console.log("> No match tag found for current commit.");
    }

    console.log("\n");
    console.log("Commit message:", commitMessage);
    console.log("Commit author:", commitAuthor);
    console.log("Commit hash:", commitHash);
    console.log("Branch name:", branchName);
    console.log("Tag:", tagName);

    // if (commitMessage.includes("Merge") && !tagName) {
    //   console.log("> Merge commit, skipping");
    //   return;
    // }
    if (commitMessage.includes("disable share")) {
      console.log("> Disable share commit, skipping");
      return;
    }

    // Extract dev-XXXX from branch name
    const devId = branchName.match(/dev-\d+/i);
    const clickupUrl = devId ? `(<https://app.clickup.com/t/4663973/${devId[0]}|ClickUp>)` : "";

    const githubUrl = `(<${githubProject}/commit/${commitHash}|GitHub>)`;

    const studioLink = getStudioLinkForBranch(branchName) ? `(<${getStudioLinkForBranch(branchName)}|Link>)` : "";

    if (tagName) {
      // Tag specific message
      message = `
>>> *[spectoda-js] New tag by ${commitAuthor}*
branch \`${branchName}\` ${githubUrl} ${clickupUrl} ${studioLink}

Tag: \`${tagName}\`

${commitMessage}`;
    } else {
      // Commit message
      message = `
>>> *[spectoda-js] New commit by ${commitAuthor}*
branch \`${branchName}\` ${githubUrl} ${clickupUrl} ${studioLink}

${commitMessage}`;
    }

    // Post a message to a channel
    const response = await slackApi.post("/chat.postMessage", {
      channel: TARGET_CHANNEL_ID,
      text: message,
      mrkdwn: true,
    });

    console.log(response.data);
  } catch (error) {
    console.error(`Error: ${error}`);
  }
}

postCommitToSlack();

function getStudioLinkForBranch(branch) {
  if (branch === "0.9") {
    return "https://0.9.studio.spectoda.com/";
  } else if (branch === "0.9-dev") {
    return "https://09dev.studio.spectoda.com/";
  } else if (branch === "staging") {
    return "https://staging-studio.up.railway.app/";
  }
}
