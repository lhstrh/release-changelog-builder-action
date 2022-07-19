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

export class Submodules {
  constructor(private octokit: Octokit, private failOnError: boolean) {}
  private static readonly gitHubRepo =
    /^(?<base>https:\/\/github.com\/|git@github.com:)(?<owner>.+)\/(?<repo>.+)(?:.git)?$/

  async getSubmodules(
    owner: string,
    repo: string,
    fromTag: string,
    toTag: string,
    paths: string[]
  ): Promise<SubmoduleInfo[]> {
    const modsInfo: SubmoduleInfo[] = []
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
        baseRef.submodule_git_url === headRef.submodule_git_url
      ) {
        const match = headRef.submodule_git_url.match(Submodules.gitHubRepo)
        if (match && match.groups) {
          let info = {
            path,
            baseRef: baseRef.sha,
            headRef: headRef.sha,
            owner: match.groups.owner,
            repo: match.groups.repo
          }
          modsInfo.push(info)
          core.info(`ℹ️ Submodule found.
            url: ${baseRef.submodule_git_url}
            path: ${info.path}
            base: ${info.baseRef}
            head: ${info.headRef}
            repo: ${info.repo}
            owner: ${info.repo}
          `)
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
    return modsInfo
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
