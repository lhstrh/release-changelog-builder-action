import * as core from '@actions/core'
import {PullConfiguration} from './types'
import {Octokit} from '@octokit/rest'
import {TagInfo, TagResult, Tags} from './tags'
import {failOrError} from './utils'
import {HttpsProxyAgent} from 'https-proxy-agent'
import {PullRequestInfo, PullRequests} from './pullRequests'
import {Commits, DiffInfo} from './commits'
import {DefaultConfiguration} from '../configuration'

export interface Options {
  owner: string // the owner of the repository
  repo: string // the repository
  fromTag: TagInfo // the tag/ref to start from
  toTag: TagInfo // the tag/ref up to
  includeOpen: boolean // defines if we should also fetch open pull requests
  failOnError: boolean // defines if we should fail the action in case of an error
  fetchViaCommits: boolean // defines if PRs are fetched via the commits identified. This will do 1 API request per commit -> Best for scenarios with squash merges | Or shorter from-to diffs (< 10 commits) | Also effective for shorters diffs for very old PRs
  fetchReviewers: boolean // defines if the action should fetch the reviewers for PRs - approved reviewers are not included in the default PR listing
  fetchReleaseInformation: boolean // defines if the action should fetch the release information for the from and to tag - e.g. the creation date for the associated release
  fetchReviews: boolean // defines if the action should fetch the reviews for the PR.
  commitMode: boolean // defines if we use the alternative commit based mode. note: this is only partially supported
  configuration: PullConfiguration // the configuration as defined in `configuration.ts`
}

export interface Data {
  diffInfo: DiffInfo
  mergedPullRequests: PullRequestInfo[]
  fromTag: TagInfo
  toTag: TagInfo
}

export class PullRequestCollector {
  constructor(
    private octokit: Octokit,
    private repositoryPath: string,
    private owner: string,
    private repo: string,
    private fromTag: string | null,
    private toTag: string | null,
    private includeOpen = false,
    private failOnError: boolean,
    private ignorePreReleases: boolean,
    private fetchViaCommits = false,
    private fetchReviewers = false,
    private fetchReleaseInformation = false,
    private fetchReviews = false,
    private commitMode = false,
    private configuration: PullConfiguration
  ) {}

  async build(): Promise<Data | null> {
    // check proxy setup for GHES environments
    const proxy = process.env.https_proxy || process.env.HTTPS_PROXY
    const noProxy = process.env.no_proxy || process.env.NO_PROXY
    let noProxyArray: string[] = []
    if (noProxy) {
      noProxyArray = noProxy.split(',')
    }

    if (proxy) {
      const agent = new HttpsProxyAgent(proxy)
      this.octokit.hook.before('request', options => {
        if (noProxyArray.includes(options.request.hostname)) {
          return
        }
        options.request.agent = agent
      })
    }

    // ensure proper from <-> to tag range
    core.startGroup(`🔖 Resolve tags`)
    const tagsApi = new Tags(this.octokit)
    const sha1 = /^[a-f0-9]{40}$/
    let tagRange: TagResult
    // check whether the tags need to be resolved or not
    if (this.fromTag && sha1.test(this.fromTag) && this.toTag && sha1.test(this.toTag)) {
      core.info(`Given start and end tags are plain SHA-1 hashes.`)
      tagRange = {
        from: {name: this.fromTag, commit: this.fromTag},
        to: {name: this.toTag, commit: this.toTag}
      }
    } else {
      // ensure proper from <-> to tag range
      tagRange = await tagsApi.retrieveRange(
        this.repositoryPath,
        this.owner,
        this.repo,
        this.fromTag,
        this.toTag,
        this.ignorePreReleases,
        this.configuration.max_tags_to_fetch || DefaultConfiguration.max_tags_to_fetch,
        this.configuration.tag_resolver || DefaultConfiguration.tag_resolver
      )
    }
    let thisTag = tagRange?.to

    if (!thisTag) {
      failOrError(`💥 Missing or couldn't resolve 'toTag'`, this.failOnError)
      return null
    } else {
      core.debug(`Resolved 'toTag' as ${thisTag.name}`)
    }

    let previousTag = tagRange?.from
    if (previousTag == null) {
      failOrError(`💥 Unable to retrieve previous tag given ${this.toTag}`, this.failOnError)
      return null
    }
    core.debug(`fromTag resolved via previousTag as: ${previousTag.name}`)

    if (this.fetchReleaseInformation) {
      // load release information from the GitHub API
      core.info(`ℹ️ Fetching release information was enabled`)
      thisTag = await tagsApi.fillTagInformation(this.repositoryPath, this.owner, this.repo, thisTag)
      previousTag = await tagsApi.fillTagInformation(this.repositoryPath, this.owner, this.repo, previousTag)
    } else {
      core.debug(`ℹ️ Fetching release information was disabled`)
    }

    core.endGroup()

    return await pullData(this.octokit, {
      owner: this.owner,
      repo: this.repo,
      fromTag: previousTag,
      toTag: thisTag,
      includeOpen: this.includeOpen,
      failOnError: this.failOnError,
      fetchViaCommits: this.fetchViaCommits,
      fetchReviewers: this.fetchReviewers,
      fetchReleaseInformation: this.fetchReleaseInformation,
      fetchReviews: this.fetchReviews,
      commitMode: this.commitMode,
      configuration: this.configuration
    })
  }
}

export async function pullData(octokit: Octokit, options: Options): Promise<Data | null> {
  let mergedPullRequests: PullRequestInfo[]
  let diffInfo: DiffInfo

  const commitsApi = new Commits(octokit)
  if (!options.commitMode) {
    core.startGroup(`🚀 Load pull requests`)
    const pullRequestsApi = new PullRequests(octokit, commitsApi)
    const [info, prs] = await pullRequestsApi.getMergedPullRequests(options)
    mergedPullRequests = prs
    diffInfo = info
  } else {
    core.startGroup(`🚀 Load commit history`)
    core.info(`⚠️ Executing experimental commit mode`)
    const [info, prs] = await commitsApi.generateCommitPRs(options)
    mergedPullRequests = prs
    diffInfo = info
  }
  core.endGroup()

  return {
    diffInfo,
    mergedPullRequests,
    fromTag: options.fromTag,
    toTag: options.toTag
  }
}
