import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { encodePath, getAccessToken } from '.'
import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { q: searchQuery = '' } = req.query

  if (typeof searchQuery !== 'string') {
    res.status(400).json({ error: 'Invalid search query' })
    return
  }

  try {
    const accessToken = await getAccessToken()

    if (!accessToken) {
      res.status(403).json({ 
        error: 'No access token',
        tokenExpired: true 
      })
      return
    }

    const debugInfo: any = {
      searchQuery,
      baseDirectory: siteConfig.baseDirectory,
      userPrincipalName: siteConfig.userPrincipalName,
      steps: []
    }

    // Step 1: Check if we can access the base directory
    try {
      const baseEncodedPath = encodePath('/')
      const baseApiUrl = `${apiConfig.driveApi}/root${baseEncodedPath}`
      
      debugInfo.steps.push('Step 1: Checking base directory access...')
      
      const { data: baseData } = await axios.get(baseApiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          select: 'id,name,folder',
        },
      })

      debugInfo.steps.push(`Base directory found: ${baseData.name}`)
      debugInfo.baseDirectoryInfo = baseData

      // Step 2: List children of base directory
      debugInfo.steps.push('Step 2: Listing base directory children...')
      
      const { data: childrenData } = await axios.get(`${baseApiUrl}/children`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          select: 'id,name,file,folder',
          top: 50,
        },
      })

      debugInfo.childrenCount = childrenData.value?.length || 0
      debugInfo.children = childrenData.value?.map((item: any) => ({
        name: item.name,
        isFolder: !!item.folder,
        isFile: !!item.file
      })) || []

      debugInfo.steps.push(`Found ${debugInfo.childrenCount} items in base directory`)

      // Step 3: Try direct search
      if (searchQuery.trim()) {
        debugInfo.steps.push('Step 3: Trying direct API search...')
        
        try {
          const searchApi = `${apiConfig.driveApi}/root${baseEncodedPath}/search(q='${encodeURIComponent(searchQuery)}')`
          const { data: searchData } = await axios.get(searchApi, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
              select: 'id,name,file,folder,parentReference',
              top: 100,
            },
          })

          debugInfo.directSearchResults = searchData.value?.length || 0
          debugInfo.directSearchItems = searchData.value?.map((item: any) => ({
            name: item.name,
            path: item.parentReference?.path
          })) || []

          debugInfo.steps.push(`Direct search found: ${debugInfo.directSearchResults} items`)
        } catch (searchError: any) {
          debugInfo.steps.push(`Direct search failed: ${searchError?.response?.data?.error?.message || searchError.message}`)
        }

        // Step 4: Try user-specific search
        debugInfo.steps.push('Step 4: Trying user-specific search...')
        
        try {
          const { data: userInfo } = await axios.get('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${accessToken}` }
          })

          debugInfo.actualUserPrincipalName = userInfo.userPrincipalName
          debugInfo.steps.push(`User: ${userInfo.userPrincipalName}`)

          const userSearchUrl = `https://graph.microsoft.com/v1.0/users/${userInfo.userPrincipalName}/drive/root:${siteConfig.baseDirectory}:/search(q='${encodeURIComponent(searchQuery)}')`
          
          const { data: userSearchData } = await axios.get(userSearchUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
              select: 'id,name,file,folder,parentReference',
              top: 100,
            },
          })

          debugInfo.userSearchResults = userSearchData.value?.length || 0
          debugInfo.userSearchItems = userSearchData.value?.map((item: any) => ({
            name: item.name,
            path: item.parentReference?.path
          })) || []

          debugInfo.steps.push(`User-specific search found: ${debugInfo.userSearchResults} items`)
        } catch (userSearchError: any) {
          debugInfo.steps.push(`User-specific search failed: ${userSearchError?.response?.data?.error?.message || userSearchError.message}`)
        }

        // Step 5: Manual filtering
        debugInfo.steps.push('Step 5: Manual filtering of directory contents...')
        
        const queryLower = searchQuery.toLowerCase().trim()
        const matchingItems = debugInfo.children.filter((item: any) => 
          item.name.toLowerCase().includes(queryLower)
        )

        debugInfo.manualFilterResults = matchingItems.length
        debugInfo.manualFilterItems = matchingItems

        debugInfo.steps.push(`Manual filtering found: ${debugInfo.manualFilterResults} matching items`)
      }

    } catch (baseError: any) {
      debugInfo.steps.push(`Failed to access base directory: ${baseError?.response?.data?.error?.message || baseError.message}`)
      debugInfo.error = baseError?.response?.data || baseError.message
    }

    res.status(200).json(debugInfo)

  } catch (error: any) {
    res.status(500).json({ 
      error: error?.response?.data?.error?.message || error?.response?.data || error.message,
      tokenExpired: error?.response?.status === 401 
    })
  }
}