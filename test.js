const sync = require('./')
const GitHubApi = require('github')

const token = ''
const owner = 'TehShrike'
const repo = 'sync-github-to-fs'

const github = new GitHubApi({
	// required
	// version: '3.0.0',
	// optional
	// debug: true,
	timeout: 5000,
	headers: {
		'user-agent': 'sync-github-to-fs', // GitHub is happy with a unique user agent
	}
})

// github.authenticate({
// 	type: 'oauth',
// 	token: token
// })

const path = '/Users/josh/code/sync-github-to-fs/test-output'
const githubOptions = {
	owner,
	repo,
	ref: 'heads/master'
}
sync(github, githubOptions, path, function(err, result) {
	if (err) {
		throw err
	}
	console.log('done:', result)
})
