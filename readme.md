Syncs a branch of a repository to a local directory.

Uses the Github API.  Doesn't create any local git metadata.

Deletes all files in the local directory that do not exist in the repo.

Calculates the hash of the local files and only downloads files from the repository that have different hashes than the local files.

# Usage

First install, require, initialize, and authenticate this [github](https://www.npmjs.com/package/github) API wrapper module.

Then, install and require this module, and do this stuff:

	var sync = require('sync-github-to-fs')

	var repoDetails = {
		user: 'TehShrike',
		repo: 'sync-github-to-fs',
		ref: 'heads/master'
	}

	sync(github, repoDetails, '/some/local/directory', function(err, res) {
		console.log('some strings saying stuff that happened', res)
	})
