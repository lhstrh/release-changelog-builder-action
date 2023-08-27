import {Octokit, RestEndpointMethodTypes} from '@octokit/rest'
import * as core from '@actions/core'
import {failOrError} from './utils'

type contentReqResponse = RestEndpointMethodTypes['repos']['getContent']['response']
export interface SubmoduleInfo {
  path: string
  baseRef: string
  headRef: string
  owner: string
  repo: string
}

export interface RepoInfo {
  baseUrl: string
  owner: string
  repo: string
}

export class Submodules {
  constructor(
    private owner: string,
    private repo: string,
    private fromTag: string,
    private toTag: string,
    private octokit: Octokit,
    private failOnError: boolean
  ) {}

  private async findPath(url: string, ref: string): Promise<string> {
    const {data} = await this.octokit.rest.repos.getContent({
      mediaType: {
        format: 'raw'
      },
      owner: this.owner,
      repo: this.repo,
      path: '.gitmodules',
      ref
    })

    // Simplify URL to increase likelihood of matches
    let simpleUrl = url
    const proto = url.match(/.+:\/\/(.+)/)
    if (proto) {
      // Cut off the protocol
      simpleUrl = proto[1]
    }
    // Cut off trailing .git if there is one
    simpleUrl = simpleUrl.replace(/.git$/, '')

    // Split off sections
    const sections = data
      .toString()
      .split(/\[submodule .*\]/)
      .filter(it => it.length > 0)

    // Find the match for search url
    for (const section of sections) {
      if (section.includes(simpleUrl)) {
        const match = section.match(/path = (.+)/)
        if (match) {
          return Promise.resolve(match[1])
        }
      }
    }
    return Promise.reject(new Error(`Could not find submodule that matches ${url}`))
  }

  async getSubmodules(urls: string[]): Promise<SubmoduleInfo[]> {
    const modsInfo: SubmoduleInfo[] = []
    core.startGroup(`📘 Detecting submodules`)

    for (const url of urls) {
      let headRef
      let baseRef
      const headPath = await this.findPath(url, this.toTag)
      const basePath = await this.findPath(url, this.fromTag)
      try {
        const resp = await this.fetchRef(this.owner, this.repo, headPath, this.toTag)
        if (resp.status === 200) {
          headRef = resp.data
        } else {
          core.warning(`Unable to find head ref. It looks like submodule '${headPath}' was removed. Ignoring.`)
          continue
        }
      } catch (error) {
        core.error(`Error retrieving submodule '${url}'.`)
        throw error
      }
      core.info(headRef.toString())
      try {
        baseRef = (await this.fetchRef(this.owner, this.repo, basePath, this.fromTag)).data
      } catch (error) {
        baseRef = headRef
        core.warning(`Unable to find base ref. Perhaps the submodule '${url}' was newly added?`)
      }
      core.info(baseRef.toString())
      if (
        !Array.isArray(baseRef) &&
        !Array.isArray(headRef) &&
        'submodule_git_url' in baseRef &&
        'submodule_git_url' in headRef &&
        baseRef.submodule_git_url !== undefined &&
        headRef.submodule_git_url !== undefined
      ) {
        const repoInfo = this.getRepoInfo(headRef.submodule_git_url)
        if (repoInfo) {
          modsInfo.push({
            path: headPath,
            baseRef: baseRef.sha,
            headRef: headRef.sha,
            owner: repoInfo.owner,
            repo: repoInfo.repo
          })
          core.info(`ℹ️ Submodule found: ${baseRef.submodule_git_url}
          repo: ${repoInfo.repo}
          owner: ${repoInfo.owner}
          path: ${headPath !== basePath ? `${basePath} => ${headPath}` : `${headPath}`}
          base: ${baseRef.sha}
          head: ${headRef.sha}`)
        } else {
          failOrError(`💥 Submodule '${baseRef.submodule_git_url}' is not a valid GitHub repository.\n`, this.failOnError)
        }
      } else {
        failOrError(`💥 Missing or couldn't resolve submodule path '${headPath}'.\n`, this.failOnError)
      }
    }
    core.endGroup()
    return modsInfo
  }

  getRepoInfo(submoduleUrl: string): RepoInfo | undefined {
    const match = submoduleUrl.match(/^(?<base>https:\/\/github.com\/|git@github.com:)(?<owner>.+)\/(?<repo>.+)?$/)
    if (match && match.groups) {
      return {
        baseUrl: match.groups.base.trim(),
        owner: match.groups.owner,
        repo: match.groups.repo.replace(/.git$/, '').trim()
      }
    }
  }

  private async fetchRef(owner: string, repo: string, path: string, ref: string): Promise<contentReqResponse> {
    const options = this.octokit.repos.getContent.endpoint.merge({
      owner,
      repo,
      path,
      ref
    })
    return this.octokit.repos.getContent(options)
  }
}
