import {Octokit, RestEndpointMethodTypes} from '@octokit/rest'
import * as core from '@actions/core'
import {failOrError} from './utils'

type contentReqResponse =
  RestEndpointMethodTypes['repos']['getContent']['response']
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
  constructor(private octokit: Octokit, private failOnError: boolean) {}

  async getSubmodules(
    owner: string,
    repo: string,
    fromTag: string,
    toTag: string,
    paths: string[]
  ): Promise<SubmoduleInfo[]> {
    const modsInfo: SubmoduleInfo[] = []
    core.startGroup(`📘 Detecting submodules`)

    for (const path of paths) {
      const headRef = (await this.fetchRef(owner, repo, path, toTag)).data
      let baseRef
      try {
        baseRef = (await this.fetchRef(owner, repo, path, fromTag)).data
      } catch (error) {
        baseRef = headRef
        core.warning(
          `Unable to find base ref. Perhaps the submodule '${path}' was newly added?`
        )
      }
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
            path,
            baseRef: baseRef.sha,
            headRef: headRef.sha,
            owner: repoInfo.owner,
            repo: repoInfo.repo
          })
          core.info(`ℹ️ Submodule found: ${baseRef.submodule_git_url}
          repo: ${repoInfo.repo}
          owner: ${repoInfo.owner}
          path: ${path}
          base: ${baseRef.sha}
          head: ${headRef.sha}`)
        } else {
          failOrError(
            `💥 Submodule '${baseRef.submodule_git_url}' is not a valid GitHub repository.\n`,
            this.failOnError
          )
        }
      } else {
        failOrError(
          `💥 Missing or couldn't resolve submodule path '${path}'.\n`,
          this.failOnError
        )
      }
    }
    core.endGroup()
    return modsInfo
  }

  getRepoInfo(submoduleUrl: string): RepoInfo | undefined {
    const match = submoduleUrl.match(
      /^(?<base>https:\/\/github.com\/|git@github.com:)(?<owner>.+)\/(?<repo>.+)?$/
    )
    if (match && match.groups) {
      return {
        baseUrl: match.groups.base.trim(),
        owner: match.groups.owner,
        repo: match.groups.repo.replace(/.git$/, '').trim()
      }
    }
  }

  private async fetchRef(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<contentReqResponse> {
    const options = this.octokit.repos.getContent.endpoint.merge({
      owner,
      repo,
      path,
      ref
    })
    return this.octokit.repos.getContent(options)
  }
}
