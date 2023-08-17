const axios = require("axios");
const { execSync } = require("child_process");

const ACCESS_TOKEN = process.env.SCREAM_COMMITS_CLICKUP_ID;

const clickupApi = axios.create({
  baseURL: "https://api.clickup.com/api/v2",
  headers: {
    Authorization: ACCESS_TOKEN,
  },
});

const TEAM_ID = "4663973";

// Generate access token
// const response = await axios.post(
//   "https://api.clickup.com/api/v2/oauth/token",
//   {
//     client_id: "NP8UM8N0YHGT03DO1CTY8H8P44H26PUR",
//     client_secret:
//       "VFN3H1CS2V136ETSV8NIMVTMIS529RXHA2SZ3CEAUBKBW3A8WQ2S3J95OQRRCTER",
//     code: "P3UGY4CCTSEH2BNNKBQZUZZVNKO0I1S3",
//   }
// );

async function postCommitToClickup() {
  try {
    const branchName = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
    const match = branchName.match(/DEV-(\d+)/);
    const taskIdNumeric = match ? match[1] : null;

    if (!taskIdNumeric) {
      console.log("Not a feature branch, skipping");
      return;
    }

    console.log(taskIdNumeric);

    const commitMessage = execSync("git log -1 --pretty=%B").toString().trim();

    // if (commitMessage.includes("Merge")) {
    //   console.log("Merge commit, skipping");
    //   return;
    // }

    if (commitMessage.includes("refactor")) {
      console.log("Refactor commit, skipping");
      return;
    }

    if (commitMessage.includes("chore")) {
      console.log("Chore commit, skipping");
      return;
    }

    if (commitMessage.includes("style")) {
      console.log("Style commit, skipping");
      return;
    }

    if (commitMessage.includes("test")) {
      console.log("Test commit, skipping");
      return;
    }

    if (commitMessage.includes("docs")) {
      console.log("Docs commit, skipping");
      return;
    }

    if (commitMessage.includes("build")) {
      console.log("Build commit, skipping");
      return;
    }

    const commitAuthor = execSync("git log -1 --pretty=format:%an").toString().trim();

    const response = await clickupApi.post(
      `/task/DEV-${taskIdNumeric}/comment`,
      {
        comment_text: `\`🤖🤖🤖 AUTOMATED REPORT 🤖🤖🤖\`
\`New commit from ${commitAuthor}\`

${commitMessage}`,
      },
      {
        params: {
          custom_task_ids: true,
          team_id: TEAM_ID,
        },
        headers: {
          Authorization: ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("> Commented on task");

    const getTask = await clickupApi.get(`/task/DEV-${taskIdNumeric}`, {
      params: {
        custom_task_ids: true,
        team_id: TEAM_ID,
      },
      headers: {
        Authorization: ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    });

    console.log("> STATUS:", getTask.data.status);

    if (["to-do", "basket"].includes(getTask.data.status.status)) {
      console.log("> Changing status to in progress");
      await clickupApi.put(
        `/task/DEV-${taskIdNumeric}`,
        {
          status: "in progress",
        },
        {
          params: {
            custom_task_ids: true,
            team_id: TEAM_ID,
          },
          headers: {
            Authorization: ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
        },
      );
      console.log("> Task status changed to 'in progress'");
    }
  } catch (error) {
    console.error(`Error: ${error}`);
    console.log(error?.response?.data);
  }
}

postCommitToClickup();
