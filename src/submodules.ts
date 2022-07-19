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
    /^(?<base>https:\/\/github.com\/|git@github.com:)(?<owner>.+)\/(?<repo>.+).git$/

  async getSubmodules(
    owner: string,
    repo: string,
    fromTag: string,
    toTag: string,
    paths: string[]
  ): Promise<SubmoduleInfo[]> {
    const modsInfo: SubmoduleInfo[] = []
    for (const path of paths) {
      const baseRef = (await this.fetchRef(owner, repo, path, fromTag)).data
      const headRef = (await this.fetchRef(owner, repo, path, toTag)).data
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
          modsInfo.push({
            path,
            baseRef: baseRef.sha,
            headRef: headRef.sha,
            owner: match.groups.owner,
            repo: match.groups.repo
          })
          core.info(`ℹ️ Submodule found.
                Path: ${path}
                BaseRef: ${baseRef.sha}
                HeadRef: ${headRef.sha}
                URL: ${baseRef.submodule_git_url}
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
