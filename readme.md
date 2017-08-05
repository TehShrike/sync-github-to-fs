Syncs a branch of a repository to a local directory.

Uses the Github API.  Doesn't create any local git metadata.

Deletes all files in the local directory that do not exist in the repo.

Calculates the hash of the local files and only downloads files from the repository that have different hashes than the local files.

# Usage

First install, require, initialize, and if you need to, authenticate this [github](https://www.npmjs.com/package/github) API wrapper module.  (Last tested with 9.x.x)

```js
const GitHubApi = require('github')

const github = new GitHubApi({
	timeout: 5000,
	headers: {
		'user-agent': 'sync-github-to-fs',
	}
})
```

Then, install and require this module, and do this stuff:

```js
const sync = require('sync-github-to-fs')

const repoDetails = {
	user: 'TehShrike',
	repo: 'sync-github-to-fs',
	ref: 'heads/master',
	simultaneousRequests: 3 // defaults to 5
}

sync(github, repoDetails, '/some/local/directory', function(err, res) {
	console.log('some strings saying stuff that happened', res)
})
```
