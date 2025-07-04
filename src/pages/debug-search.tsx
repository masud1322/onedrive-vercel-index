import { useState } from 'react'
import { GetServerSideProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { useTranslation } from 'next-i18next'
import axios from 'axios'

export default function DebugSearch() {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [debugResult, setDebugResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const handleDebugSearch = async () => {
    if (!searchQuery.trim()) return

    setLoading(true)
    try {
      const { data } = await axios.get(`/api/debug-search?q=${encodeURIComponent(searchQuery)}`)
      setDebugResult(data)
    } catch (error: any) {
      setDebugResult({
        error: error?.response?.data || error.message,
        steps: ['Error occurred during debug search']
      })
    }
    setLoading(false)
  }

  const handleListFiles = async () => {
    setLoading(true)
    try {
      const { data } = await axios.get('/api/debug-search')
      setDebugResult(data)
    } catch (error: any) {
      setDebugResult({
        error: error?.response?.data || error.message,
        steps: ['Error occurred while listing files']
      })
    }
    setLoading(false)
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="bg-white shadow-lg rounded-lg p-6 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          🔍 Search Debug Tool
        </h1>
        
        <div className="space-y-4 mb-6">
          <div className="flex space-x-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter search query (e.g., taandob, diu, boyfriends)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <button
              onClick={handleDebugSearch}
              disabled={loading || !searchQuery.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Debug Search'}
            </button>
          </div>
          
          <button
            onClick={handleListFiles}
            disabled={loading}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'List All Files in Directory'}
          </button>
        </div>

        {debugResult && (
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Configuration
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Search Query:</strong> {debugResult.searchQuery || 'N/A'}
                </div>
                <div>
                  <strong>Base Directory:</strong> {debugResult.baseDirectory || 'N/A'}
                </div>
                <div>
                  <strong>Configured User:</strong> {debugResult.userPrincipalName || 'N/A'}
                </div>
                <div>
                  <strong>Actual User:</strong> {debugResult.actualUserPrincipalName || 'N/A'}
                </div>
              </div>
            </div>

            {/* Steps */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Debug Steps
              </h3>
              <div className="space-y-2">
                {debugResult.steps?.map((step: string, index: number) => (
                  <div key={index} className="text-sm font-mono">
                    {index + 1}. {step}
                  </div>
                ))}
              </div>
            </div>

            {/* Directory Contents */}
            {debugResult.children && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Directory Contents ({debugResult.childrenCount} items)
                </h3>
                <div className="max-h-60 overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                    {debugResult.children.map((item: any, index: number) => (
                      <div key={index} className="p-2 bg-white dark:bg-gray-800 rounded border">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-gray-500">
                          {item.isFolder ? '📁 Folder' : '📄 File'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Search Results */}
            {(debugResult.directSearchResults !== undefined || debugResult.userSearchResults !== undefined || debugResult.manualFilterResults !== undefined) && (
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Search Results
                </h3>
                <div className="space-y-3">
                  <div>
                    <strong>Direct API Search:</strong> {debugResult.directSearchResults || 0} results
                    {debugResult.directSearchItems?.map((item: any, index: number) => (
                      <div key={index} className="ml-4 text-sm">• {item.name}</div>
                    ))}
                  </div>
                  
                  <div>
                    <strong>User-Specific Search:</strong> {debugResult.userSearchResults || 0} results
                    {debugResult.userSearchItems?.map((item: any, index: number) => (
                      <div key={index} className="ml-4 text-sm">• {item.name}</div>
                    ))}
                  </div>
                  
                  <div>
                    <strong>Manual Filtering:</strong> {debugResult.manualFilterResults || 0} results
                    {debugResult.manualFilterItems?.map((item: any, index: number) => (
                      <div key={index} className="ml-4 text-sm">• {item.name} ({item.isFolder ? 'Folder' : 'File'})</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {debugResult.error && (
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
                  Error
                </h3>
                <pre className="text-sm text-red-800 dark:text-red-300 whitespace-pre-wrap">
                  {JSON.stringify(debugResult.error, null, 2)}
                </pre>
              </div>
            )}

            {/* Raw JSON */}
            <details className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
              <summary className="cursor-pointer font-semibold text-gray-900 dark:text-white">
                Raw Debug Data
              </summary>
              <pre className="mt-2 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(debugResult, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'en', ['common'])),
    },
  }
}