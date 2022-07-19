import * as core from '@actions/core'
import {Configuration, DefaultConfiguration} from './configuration'
import {Octokit} from '@octokit/rest'
import {ReleaseNotes} from './releaseNotes'
import {TagResult, Tags} from './tags'
import {failOrError} from './utils'
import {fillAdditionalPlaceholders} from './transform'

export class ReleaseNotesBuilder {
  constructor(
    private octokit: Octokit,
    private repositoryPath: string,
    private owner: string | null,
    private repo: string | null,
    private fromTag: string | null,
    private toTag: string | null,
    private includeOpen: boolean = false,
    private failOnError: boolean,
    private ignorePreReleases: boolean,
    private fetchReviewers: boolean = false,
    private commitMode: boolean,
    private configuration: Configuration,
    private text: string
  ) {}

  async build(): Promise<string | null> {
    if (!this.owner) {
      failOrError(`💥 Missing or couldn't resolve 'owner'`, this.failOnError)
      return null
    } else {
      core.setOutput('owner', this.owner)
      core.debug(`Resolved 'owner' as ${this.owner}`)
    }

    if (!this.repo) {
      failOrError(`💥 Missing or couldn't resolve 'owner'`, this.failOnError)
      return null
    } else {
      core.setOutput('repo', this.repo)
      core.debug(`Resolved 'repo' as ${this.repo}`)
    }
    core.endGroup()
    core.startGroup(`🔖 Resolve tags`)
    const sha1 = /^[a-f0-9]{40}$/
    let tagRange: TagResult
    // check whether the tags need to be resolved or not
    if (
      this.fromTag &&
      sha1.test(this.fromTag) &&
      this.toTag &&
      sha1.test(this.toTag)
    ) {
      core.info(`Given start and end tags are plain SHA-1 hashes.`)
      tagRange = {
        from: {name: this.fromTag, commit: this.fromTag},
        to: {name: this.toTag, commit: this.toTag}
      }
    } else {
      // ensure proper from <-> to tag range
      const tagsApi = new Tags(this.octokit)
      tagRange = await tagsApi.retrieveRange(
        this.repositoryPath,
        this.owner,
        this.repo,
        this.fromTag,
        this.toTag,
        this.ignorePreReleases,
        this.configuration.max_tags_to_fetch ||
          DefaultConfiguration.max_tags_to_fetch,
        this.configuration.tag_resolver || DefaultConfiguration.tag_resolver
      )
    }
    const thisTag = tagRange?.to?.name
    if (!thisTag) {
      failOrError(`💥 Missing or couldn't resolve 'toTag'`, this.failOnError)
      return null
    } else {
      this.toTag = thisTag
      core.setOutput('toTag', thisTag)
      core.info(`Resolved 'toTag' as ${thisTag}`)
    }

    const previousTag = tagRange.from?.name
    if (previousTag == null) {
      failOrError(
        `💥 Unable to retrieve previous tag given ${this.toTag}`,
        this.failOnError
      )
      return null
    }
    this.fromTag = previousTag
    core.setOutput('fromTag', previousTag)
    core.info(`fromTag resolved via previousTag as: ${previousTag}`)

    core.endGroup()

    const options = {
      owner: this.owner,
      repo: this.repo,
      fromTag: this.fromTag,
      toTag: this.toTag,
      includeOpen: this.includeOpen,
      failOnError: this.failOnError,
      fetchReviewers: this.fetchReviewers,
      commitMode: this.commitMode,
      configuration: this.configuration,
      text: this.text
    }
    const releaseNotes = new ReleaseNotes(this.octokit, options)

    return (
      (await releaseNotes.pull()) ||
      fillAdditionalPlaceholders(
        this.configuration.empty_template ||
          DefaultConfiguration.empty_template,
        options
      )
    )
  }
}
