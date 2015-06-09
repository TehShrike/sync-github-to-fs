var sync = require('./')
var GitHubApi = require('github')

var token = ''
var user = ''
var repo = ''

var github = new GitHubApi({
	// required
	version: '3.0.0',
	// optional
	// debug: true,
	timeout: 5000,
	headers: {
		'user-agent': 'sync-github-to-fs', // GitHub is happy with a unique user agent
	}
})

github.authenticate({
	type: 'oauth',
	token: token
})

var path = '/Users/josh/code/sync-github-to-fs/test-output'
var githubOptions = {
		user: user,
		repo: repo,
		ref: 'heads/test'
}
sync(github, githubOptions, path, function(err, result) {
	console.log('done:', result)
})
