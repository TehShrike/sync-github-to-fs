const fs = require('fs')
const crypto = require('crypto')
const { join: joinPath, sep: platformSeparator, dirname } = require('path')

const denodeify = require('then-denodeify')
const nodeify = require('then-nodeify')
const PromiseQueue = require('p-queue')

const mkdirp = denodeify(require('mkdirp'))

const stat = denodeify(fs.stat)
const readDir = denodeify(fs.readdir)
const writeFile = denodeify(fs.writeFile)
const unlink = denodeify(fs.unlink)

module.exports = nodeify(function sync(github, githubOptions, path) {
	const queue = new PromiseQueue({
		concurrency: githubOptions.simultaneousRequests || 5
	})

	const { owner, repo } = githubOptions

	return Promise.all([
		getPathState(path).then(trimKeys(path)),
		getGithubState(github, githubOptions)
	]).then(([ pathState, githubState ]) => {
		const deletionPromises = getPathsToDelete(pathState, githubState).map(deleteFile(path))
		const downloadPromises = getPathsToDownload(pathState, githubState).map(downloadFile({ queue, path, github, owner, repo }))
		return Promise.all(deletionPromises.concat(downloadPromises))
	})
})

function downloadFile({ queue, path: originalPath, github, owner, repo }) {
	return function(state) {
		const localPath = joinPath(originalPath, state.path)
		const directory = dirname(localPath)

		return queue.add(() => {
			return github.gitdata.getBlob({
				owner,
				repo,
				sha: state.sha
			}).then(({ content }) => {
				return mkdirp(directory)
					.then(() => writeFile(localPath, Buffer.from(content, 'base64')))
					.then(() => 'downloaded ' + state.path)
			})
		})
	}
}

function deleteFile(originalPath) {
	return function(relativePath) {
		const wholePath = joinPath(originalPath, relativePath)
		return unlink(wholePath).then(() => 'deleted ' + wholePath)
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

	return Object.keys(githubState).filter(shouldDownload).map(path => {
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
			return Object.assign({}, memo, state)
		}) : {}
	})
}

function getFileState(path, filesize) {
	return new Promise(function(resolve, reject) {
		const shasum = crypto.createHash('sha1')
		const fsstream = fs.createReadStream(path)

		// shasum.setEncoding('hex')

		shasum.update('blob ' + filesize + '\0', 'utf8')

		fsstream.on('data', function(data) {
			shasum.update(data)
		})
		fsstream.on('end', function() {
			const o = {}
			o[path] = shasum.digest('hex')
			resolve(o)
		})
		fsstream.on('error', reject)
		shasum.on('error', reject)
	})
}

function getGithubState(github, githubOptions) {
	const getReference = denodeify(github.gitdata.getReference)
	const getTree = denodeify(github.gitdata.getTree)

	return getReference(githubOptions).then(function getCommitSha(res) {
		return res.object.sha
	}).then(sha => {
		return getTree({
			owner: githubOptions.owner,
			repo: githubOptions.repo,
			sha: sha,
			recursive: true
		})
	}).then(function(tree) {
		return tree.tree.filter(function(fileThingy) {
			return fileThingy.type === 'blob'
		}).map(function(fileThingy) {
			const o = {}
			o[fileThingy.path] = fileThingy.sha
			return o
		}).reduce(function(memo, state) {
			return Object.assign({}, memo, state)
		}, {})
	})
}
