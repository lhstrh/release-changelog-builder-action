import * as core from '@actions/core'
import * as github from '@actions/github'
import {resolveConfiguration, retrieveRepositoryPath, writeOutput} from './utils'
import {ReleaseNotesBuilder} from './releaseNotesBuilder'
import {Octokit} from '@octokit/rest'
import {Submodules} from './submodules'

async function run(): Promise<void> {
  core.setOutput('failed', false) // mark the action not failed by default

  core.startGroup(`📘 Reading input values`)
  try {
    // read in path specification, resolve github workspace, and repo path
    const inputPath = core.getInput('path')
    const repositoryPath = retrieveRepositoryPath(inputPath)

    // read in configuration file if possible
    const configurationFile: string = core.getInput('configuration')
    const configuration = resolveConfiguration(repositoryPath, configurationFile)

    // read in repository inputs
    const baseUrl = core.getInput('baseUrl')
    const token = core.getInput('token')
    const owner = core.getInput('owner') || github.context.repo.owner
    const repo = core.getInput('repo') || github.context.repo.repo
    // read in from, to tag inputs
    const fromTag = core.getInput('fromTag')
    const toTag = core.getInput('toTag')
    // read in flags
    const includeOpen = core.getInput('includeOpen') === 'true'
    const ignorePreReleases = core.getInput('ignorePreReleases') === 'true'
    const failOnError = core.getInput('failOnError') === 'true'
    const fetchReviewers = core.getInput('fetchReviewers') === 'true'
    const commitMode = core.getInput('commitMode') === 'true'
    // read in the optional text
    const text = core.getInput('text') || ''

    // load octokit instance
    const octokit = new Octokit({
      auth: `token ${token || process.env.GITHUB_TOKEN}`,
      baseUrl: `${baseUrl || 'https://api.github.com'}`
    })

    const mainBuilder = new ReleaseNotesBuilder(
      octokit,
      repositoryPath,
      owner,
      repo,
      fromTag,
      toTag,
      includeOpen,
      failOnError,
      ignorePreReleases,
      fetchReviewers,
      commitMode,
      configuration,
      text
    )
    let result = await mainBuilder.build()
    let appendix = ''

    if (configuration.submodule_urls && configuration.submodule_urls.length > 0) {
      configuration.template = configuration.submodule_template
      configuration.empty_template = configuration.submodule_empty_template

      const submodules = await new Submodules(
        owner,
        repo,
        mainBuilder.getFromTag(),
        mainBuilder.getToTag(),
        repositoryPath,
        octokit,
        failOnError
      ).getSubmodules(configuration.submodule_urls)

      for (const submodule of submodules) {
        core.info(`⚙️ Indexing submodule '${submodule.repo}'...`)
        const notes = await new ReleaseNotesBuilder(
          octokit,
          submodule.path,
          submodule.owner,
          submodule.repo,
          submodule.baseRef,
          submodule.headRef,
          includeOpen,
          failOnError,
          ignorePreReleases,
          fetchReviewers,
          commitMode,
          configuration,
          text
        ).build()
        appendix += notes
      }

      result = `${result}${appendix}`
    }

    core.setOutput('changelog', result)

    // Debugging...
    core.info(`${result}`)

    // write the result in changelog to file if possible
    const outputFile: string = core.getInput('outputFile')
    if (outputFile !== '') {
      core.debug(`Enabled writing the changelog to disk`)
      writeOutput(repositoryPath, outputFile, result)
    }
  } catch (error: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
    core.setFailed(error.message)
  }
}

run()
