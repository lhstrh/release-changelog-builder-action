import {Octokit, RestEndpointMethodTypes} from '@octokit/rest'
import {failOrError} from './utils'

type contentReqResponse =
  RestEndpointMethodTypes['repos']['getContent']['response']

export interface SubmoduleInfo {
  path: string
  baseRef: string
  headRef: string
}

export class Submodules {
  constructor(private octokit: Octokit, private failOnError: boolean) {}

  private readonly shaRegex = /^[a-f0-9]{64}$/gi

  async getSubmodules(
    owner: string,
    repo: string,
    fromTag: string,
    toTag: string,
    paths: string[]
  ): Promise<SubmoduleInfo[]> {
    const modsInfo: SubmoduleInfo[] = []
    for (const path of paths) {
      const baseRef = this.fetchRef(owner, repo, path, fromTag)
      const headRef = this.fetchRef(owner, repo, path, toTag)
      const info = {
        path,
        baseRef: (await baseRef).data.toString(),
        headRef: (await headRef).data.toString()
      }
      if (
        this.shaRegex.test(info.baseRef) &&
        this.shaRegex.test(info.headRef)
      ) {
        modsInfo.push(info)
      } else {
        failOrError(
          `💥 Missing or couldn't resolve submodule path '${path}'.\n
          Found base ref: ${baseRef}\n
          Found head ref: ${headRef}
          `,
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
    tag: string
  ): Promise<contentReqResponse> {
    const options = this.octokit.repos.getContent.endpoint.merge({
      owner,
      repo,
      path,
      tag
    })
    return this.octokit.repos.getContent(options)
  }
}
