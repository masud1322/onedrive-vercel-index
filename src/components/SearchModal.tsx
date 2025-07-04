import axios from 'axios'
import useSWR, { SWRResponse } from 'swr'
import { Dispatch, Fragment, SetStateAction, useState } from 'react'
import AwesomeDebouncePromise from 'awesome-debounce-promise'
import { useAsync } from 'react-async-hook'
import useConstant from 'use-constant'
import { useTranslation } from 'next-i18next'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Dialog, Transition } from '@headlessui/react'

import type { OdDriveItem, OdSearchResult } from '../types'
import { LoadingIcon } from './Loading'

import { getFileIcon } from '../utils/getFileIcon'
import { fetcher } from '../utils/fetchWithSWR'
import siteConfig from '../../config/site.config'

/**
 * Extract the searched item's path in field 'parentReference' and convert it to the
 * absolute path represented in onedrive-vercel-index
 *
 * @param path Path returned from the parentReference field of the driveItem
 * @returns The absolute path of the driveItem in the search result
 */
function mapAbsolutePath(path: string): string {
  // path is in the format of '/drive/root:/path/to/file', if baseDirectory is '/' then we split on 'root:',
  // otherwise we split on the user defined 'baseDirectory'
  const absolutePath = path.split(siteConfig.baseDirectory === '/' ? 'root:' : siteConfig.baseDirectory)
  // path returned by the API may contain #, by doing a decodeURIComponent and then encodeURIComponent we can
  // replace URL sensitive characters such as the # with %23
  return absolutePath.length > 1 // solve https://github.com/spencerwooo/onedrive-vercel-index/issues/539
    ? absolutePath[1]
        .split('/')
        .map(p => encodeURIComponent(decodeURIComponent(p)))
        .join('/')
    : ''
}

/**
 * Implements a debounced search function that returns a promise that resolves to an array of
 * search results.
 *
 * @returns A react hook for a debounced async search of the drive
 */
function useDriveItemSearch() {
  const [query, setQuery] = useState('')
  const [useComprehensive, setUseComprehensive] = useState(false)
  
  const searchDriveItem = async (q: string) => {
    // Try the new comprehensive search first
    try {
      const { data } = await axios.get(`/api/search-all/?q=${q}&comprehensive=${useComprehensive}`)
      
      if (data.results && Array.isArray(data.results)) {
        // Map the results to the expected format
        const mappedResults = data.results.map((item: any) => {
          item['path'] = item.path || (
            'path' in item.parentReference
              ? `${mapAbsolutePath(item.parentReference.path)}/${encodeURIComponent(item.name)}`
              : ''
          )
          return item
        })
        return mappedResults
      }
    } catch (comprehensiveError) {
      console.log('Comprehensive search failed, trying regular search:', comprehensiveError)
    }
    
    // Fallback to regular search
    try {
      const { data } = await axios.get<OdSearchResult>(`/api/search/?q=${q}`)

      // Map parentReference to the absolute path of the search result
      data.map(item => {
        item['path'] =
          'path' in item.parentReference
            ? // OneDrive International have the path returned in the parentReference field
              `${mapAbsolutePath(item.parentReference.path)}/${encodeURIComponent(item.name)}`
            : // OneDrive for Business/Education does not, so we need extra steps here
              ''
      })

      return data
    } catch (regularError) {
      throw regularError
    }
  }

  const debouncedDriveItemSearch = useConstant(() => AwesomeDebouncePromise(searchDriveItem, 1000))
  const results = useAsync(async () => {
    if (query.length === 0) {
      return []
    } else {
      return debouncedDriveItemSearch(query)
    }
  }, [query, useComprehensive])

  return {
    query,
    setQuery,
    useComprehensive,
    setUseComprehensive,
    results,
  }
}

function SearchResultItemTemplate({
  driveItem,
  driveItemPath,
  itemDescription,
  disabled,
}: {
  driveItem: OdSearchResult[number]
  driveItemPath: string
  itemDescription: string
  disabled: boolean
}) {
  return (
    <Link
      href={driveItemPath}
      passHref
      className={`flex items-center space-x-4 border-b border-gray-400/30 px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-850 ${
        disabled ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <FontAwesomeIcon icon={driveItem.file ? getFileIcon(driveItem.name) : ['far', 'folder']} />
      <div>
        <div className="text-sm font-medium leading-8">{driveItem.name}</div>
        <div
          className={`overflow-hidden truncate font-mono text-xs opacity-60 ${
            itemDescription === 'Loading ...' && 'animate-pulse'
          }`}
        >
          {itemDescription}
        </div>
      </div>
    </Link>
  )
}

function SearchResultItemLoadRemote({ result }: { result: OdSearchResult[number] }) {
  const { data, error }: SWRResponse<OdDriveItem, { status: number; message: any }> = useSWR(
    [`/api/item/?id=${result.id}`],
    fetcher
  )

  const { t } = useTranslation()

  if (error) {
    return (
      <SearchResultItemTemplate
        driveItem={result}
        driveItemPath={''}
        itemDescription={typeof error.message?.error === 'string' ? error.message.error : JSON.stringify(error.message)}
        disabled={true}
      />
    )
  }
  if (!data) {
    return (
      <SearchResultItemTemplate
        driveItem={result}
        driveItemPath={''}
        itemDescription={t('Loading ...')}
        disabled={true}
      />
    )
  }

  const driveItemPath = `${mapAbsolutePath(data.parentReference.path)}/${encodeURIComponent(data.name)}`
  return (
    <SearchResultItemTemplate
      driveItem={result}
      driveItemPath={driveItemPath}
      itemDescription={decodeURIComponent(driveItemPath)}
      disabled={false}
    />
  )
}

function SearchResultItem({ result }: { result: OdSearchResult[number] }) {
  if (result.path === '') {
    // path is empty, which means we need to fetch the parentReference to get the path
    return <SearchResultItemLoadRemote result={result} />
  } else {
    // path is not an empty string in the search result, such that we can directly render the component as is
    const driveItemPath = decodeURIComponent(result.path)
    return (
      <SearchResultItemTemplate
        driveItem={result}
        driveItemPath={result.path}
        itemDescription={driveItemPath}
        disabled={false}
      />
    )
  }
}

export default function SearchModal({
  searchOpen,
  setSearchOpen,
}: {
  searchOpen: boolean
  setSearchOpen: Dispatch<SetStateAction<boolean>>
}) {
  const { query, setQuery, useComprehensive, setUseComprehensive, results } = useDriveItemSearch()

  const { t } = useTranslation()

  const closeSearchBox = () => {
    setSearchOpen(false)
    setQuery('')
  }

  return (
    <Transition appear show={searchOpen} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 z-[200] overflow-y-auto" onClose={closeSearchBox}>
        <div className="min-h-screen px-4 text-center">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-100"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Dialog.Overlay className="fixed inset-0 bg-white/80 dark:bg-gray-800/80" />
          </Transition.Child>

          <Transition.Child
            as={Fragment}
            enter="ease-out duration-100"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="my-12 inline-block w-full max-w-3xl transform overflow-hidden rounded border border-gray-400/30 text-left shadow-xl transition-all">
              <Dialog.Title
                as="h3"
                className="border-b border-gray-400/30 bg-gray-50 dark:bg-gray-800 dark:text-white"
              >
                <div className="flex items-center space-x-4 p-4">
                  <FontAwesomeIcon icon="search" className="h-4 w-4" />
                  <input
                    type="text"
                    id="search-box"
                    className="flex-1 bg-transparent focus:outline-none focus-visible:outline-none"
                    placeholder={t('Search ...')}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  <div className="rounded-lg bg-gray-200 px-2 py-1 text-xs font-medium dark:bg-gray-700">ESC</div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-400/30 px-4 py-2 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useComprehensive}
                      onChange={e => setUseComprehensive(e.target.checked)}
                      className="rounded"
                    />
                    <span>Deep Search (searches all subfolders)</span>
                  </label>
                  <span className="text-gray-500">
                    Searching from: {siteConfig.baseDirectory}
                  </span>
                </div>
              </Dialog.Title>
              <div
                className="max-h-[80vh] overflow-x-hidden overflow-y-scroll bg-white dark:bg-gray-900 dark:text-white"
                onClick={closeSearchBox}
              >
                {results.loading && (
                  <div className="px-4 py-12 text-center text-sm font-medium">
                    <LoadingIcon className="svg-inline--fa mr-2 inline-block h-4 w-4 animate-spin" />
                    <span>{t('Loading ...')}</span>
                  </div>
                )}
                {results.error && (
                  <div className="px-4 py-12 text-center text-sm font-medium">
                    <div className="text-red-600 dark:text-red-400">
                      {((results.error as any)?.response?.data?.tokenExpired) ? (
                        <div className="space-y-2">
                          <div>{t('Access token expired')}</div>
                          <Link
                            href="/tokenrestore" 
                            className="inline-block rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
                          >
                            {t('Restore Tokens')}
                          </Link>
                        </div>
                      ) : (
                        t('Error: {{message}}', { 
                          message: (results.error as any)?.response?.data?.error || results.error.message 
                        })
                      )}
                    </div>
                  </div>
                )}
                {results.result && (
                  <>
                    {results.result.length === 0 ? (
                      <div className="px-4 py-12 text-center text-sm font-medium">{t('Nothing here.')}</div>
                    ) : (
                      results.result.map(result => <SearchResultItem key={result.id} result={result} />)
                    )}
                  </>
                )}
              </div>
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  )
}
