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
		getDiskPathState(path).then(makePropertyPrefixTrimmer(path)),
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
			}).then(response => {
				return mkdirp(directory)
					.then(() => writeFile(localPath, Buffer.from(response.data.content, 'base64')))
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

function makePropertyPrefixTrimmer(prefix) {
	function trim(key) {
		key = key.indexOf(prefix) === 0 ?  key.substr(prefix.length) : key
		if (key[0] === platformSeparator) {
			key = key.substring(1)
		}
		return key
	}
	return function trimPrefixOffOfProperties(input) {
		return Object.keys(input).reduce(function(memo, key) {
			memo[trim(key)] = input[key]
			return memo
		}, {})
	}
}

function getDiskPathState(path) {
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
		return files.map(filename => joinPath(path, filename))
	}).then(
		paths => Promise.all(paths.map(getDiskPathState))
	).then(pathStates => {
		return pathStates.length
			? pathStates.reduce((memo, state) => Object.assign({}, memo, state))
			: {}
	})
}

function getFileState(path, filesize) {
	return new Promise((resolve, reject) => {
		const shasum = crypto.createHash('sha1')
		const fsstream = fs.createReadStream(path)

		// shasum.setEncoding('hex')

		shasum.update('blob ' + filesize + '\0', 'utf8')

		fsstream.on('data', data => shasum.update(data))
		fsstream.on('end', () => resolve({ [path]: shasum.digest('hex') }))
		fsstream.on('error', reject)
		shasum.on('error', reject)
	})
}

function getGithubState(github, githubOptions) {
	const getReference = denodeify(github.gitdata.getReference)
	const getTree = denodeify(github.gitdata.getTree)

	return getReference(githubOptions).then(function getCommitSha(response) {
		return response.data.object.sha
	}).then(sha => {
		return getTree({
			owner: githubOptions.owner,
			repo: githubOptions.repo,
			sha: sha,
			recursive: true
		})
	}).then(function(response) {
		return response.data.tree.filter(function(fileThingy) {
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
