var Promise = require('promise')
var fs = require('fs')
var joinPath = require('path').join
var dirname = require('path').dirname
var platformSeparator = require('path').sep
var crypto = require('crypto')
var extend = require('extend')
var fs = require('fs')
var mkdirp = Promise.denodeify(require('mkdirp'))

var stat = Promise.denodeify(fs.stat)
var readDir = Promise.denodeify(fs.readdir)
var writeFile = Promise.denodeify(fs.writeFile)
var unlink = Promise.denodeify(fs.unlink)

module.exports = Promise.nodeify(function sync(github, githubOptions, path) {
	return Promise.all([ getPathState(path).then(trimKeys(path)), getGithubState(github, githubOptions) ]).then(function(states) {
		var pathState = states[0]
		var githubState = states[1]
		var deletionPromises = getPathsToDelete(pathState, githubState).map(deleteFile(path))
		var downloadPromises = getPathsToDownload(pathState, githubState).map(downloadFile(path, github, githubOptions))
		return Promise.all(deletionPromises.concat(downloadPromises))
	}).catch(function(err) {
		console.error(err.stack || err)
	})
})

function downloadFile(originalPath, github, githubOptions) {
	return function(state) {
		return new Promise(function(resolve, reject) {
			var localPath = joinPath(originalPath, state.path)
			var directory = dirname(localPath)
			github.gitdata.getBlob({
				user: githubOptions.user,
				repo: githubOptions.repo,
				sha: state.sha
			}, function(err, res) {
				if (err)  {
					reject(err)
				} else {
					resolve(mkdirp(directory).then(function() {
						return writeFile(localPath, new Buffer(res.content, 'base64'))
					}).then(function() {
						return 'downloaded ' + state.path
					}))
				}
			})
		})
	}
}

function deleteFile(originalPath) {
	return function(relativePath) {
		var wholePath = joinPath(originalPath, relativePath)
		return unlink(wholePath).then(function() {
			return 'deleted ' + wholePath
		})
	}
}

function getPathsToDelete(pathState, githubState) {
	function shouldDelete(path) {
		return !githubState[path]
	}
	return Object.keys(pathState).filter(shouldDelete)
}

function getPathsToDownload(pathState, githubState) {
	function shouldDownload(path) {
		return !pathState[path] || pathState[path] !== githubState[path]
	}

	return Object.keys(githubState).filter(shouldDownload).map(function(path) {
		return {
			path: path,
			sha: githubState[path]
		}
	})
}

function trimKeys(beginning) {
	function trim(key) {
		key = key.indexOf(beginning) === 0 ?  key.substr(beginning.length) : key
		if (key[0] === platformSeparator) {
			key = key.substring(1)
		}
		return key
	}
	return function(input) {
		return Object.keys(input).reduce(function(memo, key) {
			memo[trim(key)] = input[key]
			return memo
		}, {})
	}
}

function getPathState(path) {
	return stat(path).then(function(stats) {
		if (stats.isDirectory()) {
			return getDirectoryState(path)
		} else if (stats.isFile()) {
			return getFileState(path, stats.size)
		} else {
			return null
		}
	})
}

function getDirectoryState(path) {
	return readDir(path).then(function mapToPaths(files) {
		return files.map(function(filename) {
			return joinPath(path, filename)
		})
	}).then(function(paths) {
		return Promise.all(paths.map(getPathState))
	}).then(function(pathStates) {
		return pathStates.length ? pathStates.reduce(function(memo, state) {
			return extend(memo, state)
		}) : {}
	})
}

function getFileState(path, filesize) {
	return new Promise(function(resolve, reject) {
		var shasum = crypto.createHash('sha1')
		var fsstream = fs.createReadStream(path)

		// shasum.setEncoding('hex')

		shasum.update('blob ' + filesize + '\0', 'utf8')

		fsstream.on('data', function(data) {
			shasum.update(data)
		})
		fsstream.on('end', function() {
			var o = {}
			o[path] = shasum.digest('hex')
			resolve(o)
		})
		fsstream.on('error', reject)
		shasum.on('error', reject)
	})
}

function getGithubState(github, githubOptions) {
	var getReference = Promise.denodeify(github.gitdata.getReference)
	var getTree = Promise.denodeify(github.gitdata.getTree)

	return getReference(githubOptions).then(function getCommitSha(res) {
		return res.object.sha
	}).then(function(sha) {
		return getTree({
			user: githubOptions.user,
			repo: githubOptions.repo,
			sha: sha,
			recursive: true
		})
	}).then(function(tree) {
		return tree.tree.filter(function(fileThingy) {
			return fileThingy.type === 'blob'
		}).map(function(fileThingy) {
			var o = {}
			o[fileThingy.path] = fileThingy.sha
			return o
		}).reduce(function(memo, state) {
			return extend(memo, state)
		}, {})
	})
}
