const fs = require('fs');
const express = require('express');
const cors = require('cors');
const simpleGit = require('simple-git');
require('dotenv').config()
const app = express();
const port = 3000;

// // Define the allowed origins/URLs
// const allowedOrigins = ['http://example1.com', 'http://example2.com'];

// // Configure CORS middleware
// app.use(cors({
//   origin: (origin, callback) => {
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   }
// }));

app.use(cors());

app.use(express.json());

const git = simpleGit('./Automated-Daily-Coding-Problem/', { binary: 'git' }).clean(
  simpleGit.CleanOptions.FORCE
);

git.addRemote('origin', process.env.GIT_REMOTE_URL);
git.pull('origin', 'main');

async function constructCommit(data) {
  await git.add('./*');
  await git.commit(`Auto commit from compute engine ${data}`);
}


async function writeToFile(rawText, html, subject) {
  // check if the email conatins a coding problem
  const pattern = /Problem #(\d+)/i;
  const match = subject.match(pattern);

  if (match) {

    const number = match[1];
    // Create a new directory for that problem
    fs.mkdirSync(`Automated-Daily-Coding-Problem/Problem ${number}`);

    // Write the raw text to a md file
    fs.writeFile(
      `Automated-Daily-Coding-Problem/Problem ${number}/Problem${number}.md`,
      rawText,
      { encoding: 'utf8' },
      (err) => {
        if (err) {
          console.error(err);
          return;
        }
      }
    );

    // Write it to a html file
    fs.writeFile(
      `Automated-Daily-Coding-Problem/Problem ${number}/Problem${number}.html`,
      html,
      (err) => {
        if (err) {
          console.error(err);
          return;
        }
      }
    );

    // Construct commit msg and commit the changes to git
    await constructCommit(subject);
  }
}


app.get('/read', (req, res) => {
  console.log('request url is ------>', JSON.stringify(req.headers));
  res.send(`Get endpoint is working ${JSON.stringify(req.headers)}`);
});

app.post('/write', async (req, res) => {

  // console.log(JSON.stringify(req));
  const { rawText, html, subject } = req.body;
  
  try {
    await writeToFile(rawText, html, subject);

    // Push the changes to remote
    await git.push('origin', 'main');

    await res.send(`! Pushed to github!`);
  } catch (error) {
    // send error response with status code 500
    await res.status(500).send({ error });
  }
  
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
