import {Rule, Extractor, Regex, Transformer, Sort, PullConfiguration} from './pr-collector/types'

export interface Configuration extends PullConfiguration {
  max_tags_to_fetch: number
  max_pull_requests: number
  max_back_track_time_days: number
  exclude_merge_branches: string[]
  sort: Sort | string // "ASC" or "DESC"
  template: string
  pr_template: string
  empty_template: string
  categories: Category[]
  ignore_labels: string[]
  label_extractor: Extractor[]
  duplicate_filter?: Extractor // extract an identifier from a PR used to detect duplicates, will keep the last match (depends on `sort`)
  reference?: Extractor // extracts a reference from a PR, used to establish parent child relations. This will remove the child from the main PR list.
  transformers: Transformer[]
  tag_resolver: TagResolver
  base_branches: string[]
  custom_placeholders?: Placeholder[]
  trim_values: boolean
  submodule_paths: string[]
  submodule_template: string
  submodule_empty_template: string
}

export interface Category {
  key?: string // a key for this category. This is currently only used for the json output
  title: string // the title of this category
  labels?: string[] // labels to associate PRs to this category
  exclude_labels?: string[] // if an exclude label is detected, the PR will be excluded from this category
  rules?: Rule[] // rules to associate PRs to this category
  exhaustive?: boolean // requires all labels to be present in the PR
  exhaustive_rules?: boolean // requires all rules to be present in the PR (if not set, defaults to exhaustive value)
  empty_content?: string // if the category has no matching PRs, this content will be used. If not set, the category will be skipped in the changelog.
}

/**
 * Defines the properties of the PullRequestInfo useable in different configurations
 */
export type Property =
  | 'number'
  | 'title'
  | 'branch'
  | 'author'
  | 'labels'
  | 'milestone'
  | 'body'
  | 'assignees'
  | 'requestedReviewers'
  | 'approvedReviewers'
  | 'status'

export interface TagResolver {
  method: string // semver, sort
  filter?: Regex // the regex to filter the tags, prior to sorting
  transformer?: Transformer // transforms the tag name using the regex, run after the filter
}

export interface Placeholder {
  name: string // the name of the new placeholder
  source: string // the src placeholder which will be used to apply the transformer on
  transformer: Transformer // the transformer to use to transform the original placeholder into the custom placheolder
}

export const DefaultConfiguration: Configuration = {
  max_tags_to_fetch: 200, // the amount of tags to fetch from the github API
  max_pull_requests: 200, // the amount of pull requests to process
  max_back_track_time_days: 365, // allow max of 365 days back to check up on pull requests
  exclude_merge_branches: [], // branches to exclude from counting as PRs (e.g. YourOrg/qa, YourOrg/main)
  sort: {
    // defines the sorting logic for PRs
    order: 'ASC', // the sorting order
    on_property: 'mergedAt' // the property to sort on. (mergedAt falls back to createdAt)
  },
  template: '${{CHANGELOG}}', // the global template to host the changelog
  pr_template: '- ${{TITLE}}\n   - PR: #${{NUMBER}}', // the per PR template to pick
  empty_template: '- no changes', // the template to use if no pull requests are found
  categories: [
    {
      title: '## 🚀 Features',
      labels: ['feature']
    },
    {
      title: '## 🐛 Fixes',
      labels: ['fix']
    },
    {
      title: '## 🧪 Tests',
      labels: ['test']
    },
    {
      title: '## 📦 Uncategorized',
      labels: []
    }
  ], // the categories to support for the ordering
  ignore_labels: ['ignore'], // list of labels being ignored from the changelog
  label_extractor: [], // extracts additional labels from the commit message given a regex
  duplicate_filter: undefined, // extract an identifier from a PR used to detect duplicates, will keep the last match (depends on `sort`)
  transformers: [], // transformers to apply on the PR description according to the `pr_template`
  tag_resolver: {
    // defines the logic on how to resolve the previous tag, only relevant if `fromTag` is not specified
    method: 'semver', // defines which method to use, by default it will use `semver` (dropping all non matching tags). Alternative `sort` is also available.
    filter: undefined, // filter out all tags not matching the regex
    transformer: undefined // transforms the tag name using the regex, run after the filter
  },
  base_branches: [], // target branches for the merged PR ignoring PRs with different target branch, by default it will get all PRs
  custom_placeholders: [],
  trim_values: false, // defines if values are being trimmed prior to inserting
  submodule_paths: [], // paths in which to look for submodules
  // template for submodule sections
  submodule_template:
    '### Submodule [${{OWNER}}/${{REPO}}](http://github.com/${{OWNER}}/${{REPO})\n\n${{CHANGELOG}}**🏷️ Miscellaneous**\n${{UNCATEGORIZED}}\n',
  submodule_empty_template: '### Submodule [${{OWNER}}/${{REPO}}](http://github.com/${{OWNER}}/${{REPO})\n\nNo changes.'
}
