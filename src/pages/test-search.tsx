import { useState } from 'react'
import { GetServerSideProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import axios from 'axios'

export default function TestSearch() {
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)

  const testFixedSearch = async () => {
    if (!searchQuery.trim()) return

    setLoading(true)
    try {
      const { data } = await axios.get(`/api/search-fixed?q=${encodeURIComponent(searchQuery)}&debug=true`)
      setResults(data)
    } catch (error: any) {
      setResults({
        error: error?.response?.data || error.message,
        success: false
      })
    }
    setLoading(false)
  }

  const testRegularSearch = async () => {
    if (!searchQuery.trim()) return

    setLoading(true)
    try {
      const { data } = await axios.get(`/api/search?q=${encodeURIComponent(searchQuery)}`)
      setResults({
        regularSearch: data,
        totalFound: Array.isArray(data) ? data.length : 0,
        success: true
      })
    } catch (error: any) {
      setResults({
        error: error?.response?.data || error.message,
        success: false
      })
    }
    setLoading(false)
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="bg-white shadow-lg rounded-lg p-6 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          🚀 Fixed Search Test
        </h1>
        
        <div className="space-y-4 mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Test search: taandob, diu, boyfriends..."
            className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-lg"
          />
          
          <div className="flex space-x-4">
            <button
              onClick={testFixedSearch}
              disabled={loading || !searchQuery.trim()}
              className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {loading ? 'Testing...' : '🚀 Test FIXED Search'}
            </button>
            
            <button
              onClick={testRegularSearch}
              disabled={loading || !searchQuery.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Testing...' : '📊 Test Regular Search'}
            </button>
          </div>
        </div>

        {results && (
          <div className="space-y-4">
            {results.success !== false && results.totalFiles !== undefined && (
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border-l-4 border-green-500">
                <h3 className="text-lg font-semibold text-green-900 dark:text-green-200 mb-2">
                  ✅ FIXED Search Results
                </h3>
                <div className="space-y-2 text-sm">
                  <div><strong>Total Files Found:</strong> {results.totalFiles}</div>
                  <div><strong>Matching Files:</strong> {results.total}</div>
                  <div><strong>Query:</strong> &ldquo;{results.query}&rdquo;</div>
                  <div><strong>Method:</strong> {results.method}</div>
                  <div><strong>Base Folder ID:</strong> {results.baseFolderId}</div>
                </div>
                
                {results.results && results.results.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold mb-2">Found Files:</h4>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {results.results.map((item: any, index: number) => (
                        <div key={index} className="p-2 bg-white dark:bg-gray-800 rounded border text-sm">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-gray-500">Path: {item.path}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {results.debugInfo && (
                  <details className="mt-4">
                    <summary className="cursor-pointer font-medium">Debug Info</summary>
                    <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-x-auto">
                      {JSON.stringify(results.debugInfo, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {results.regularSearch !== undefined && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border-l-4 border-blue-500">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-2">
                  📊 Regular Search Results
                </h3>
                <div className="space-y-2 text-sm">
                  <div><strong>Results Found:</strong> {results.totalFound}</div>
                  
                  {results.regularSearch && results.regularSearch.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-semibold mb-2">Found Files:</h4>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {results.regularSearch.map((item: any, index: number) => (
                          <div key={index} className="p-2 bg-white dark:bg-gray-800 rounded border text-sm">
                            <div className="font-medium">{item.name}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {results.error && (
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border-l-4 border-red-500">
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
                  ❌ Error
                </h3>
                <pre className="text-sm text-red-800 dark:text-red-300 whitespace-pre-wrap">
                  {JSON.stringify(results.error, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            🔧 What Was Fixed:
          </h3>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <li>• <strong>Problem:</strong> Could find folder but not access its contents</li>
            <li>• <strong>Solution:</strong> Use folder ID directly instead of path-based access</li>
            <li>• <strong>Method:</strong> GET /items/&#123;folderId&#125;/children instead of path:/children</li>
            <li>• <strong>Result:</strong> Should now find ALL files in ALL subfolders</li>
          </ul>
        </div>
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