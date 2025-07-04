import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { useTranslation } from 'next-i18next'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import siteConfig from '../../config/site.config'

export default function TokenRestore() {
  const { t } = useTranslation()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === siteConfig.tokenRestorePassword) {
      setIsAuthenticated(true)
      setError('')
    } else {
      setError('Invalid password')
    }
  }

  const handleTokenRestore = () => {
    setIsLoading(true)
    // Redirect to the OAuth initialization page
    router.push('/onedrive-vercel-index-oauth/step-1')
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col bg-white dark:bg-gray-900">
        <div className="flex min-h-screen items-center justify-center">
          <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow-lg dark:bg-gray-800">
            <div className="text-center">
              <FontAwesomeIcon icon="key" className="mx-auto h-12 w-12 text-blue-600 dark:text-blue-400" />
              <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
                Token Restore
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Enter the restore password to re-authenticate your tokens
              </p>
            </div>

            <form className="mt-8 space-y-6" onSubmit={handlePasswordSubmit}>
              <div>
                <label htmlFor="password" className="sr-only">
                  Restore Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 sm:text-sm"
                  placeholder="Restore password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
                  <div className="flex">
                    <FontAwesomeIcon icon="exclamation-circle" className="h-5 w-5 text-red-400" />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                        {error}
                      </h3>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  className="group relative flex w-full justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  <FontAwesomeIcon icon="unlock-alt" className="mr-2 h-4 w-4" />
                  Authenticate
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col bg-white dark:bg-gray-900">
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow-lg dark:bg-gray-800">
          <div className="text-center">
            <FontAwesomeIcon icon="check-circle" className="mx-auto h-12 w-12 text-green-600 dark:text-green-400" />
            <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
              Authentication Required
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Your tokens have expired. Click below to re-authenticate with Microsoft.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-md bg-yellow-50 p-4 dark:bg-yellow-900/20">
              <div className="flex">
                <FontAwesomeIcon icon="exclamation-triangle" className="h-5 w-5 text-yellow-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    Token Expired
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                    <p>
                      Your access tokens have expired. You need to re-authenticate with Microsoft to continue using the service.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleTokenRestore}
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <FontAwesomeIcon 
                icon={isLoading ? "spinner" : "sync-alt"} 
                className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} 
              />
              {isLoading ? 'Redirecting...' : 'Restore Tokens'}
            </button>

            <button
              onClick={() => router.push('/')}
              className="group relative flex w-full justify-center rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              <FontAwesomeIcon icon="home" className="mr-2 h-4 w-4" />
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  }
}