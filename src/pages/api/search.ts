import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { encodePath, getAccessToken } from '.'
import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'

interface DriveItem {
  id: string
  name: string
  file?: any
  folder?: any
  parentReference: {
    path?: string
  }
}

/**
 * Recursively search through OneDrive folders to find all files
 * This bypasses Microsoft Graph's limited search functionality
 */
async function recursiveSearch(
  accessToken: string, 
  searchQuery: string, 
  folderPath: string = '',
  results: DriveItem[] = [],
  maxDepth: number = 5,
  currentDepth: number = 0
): Promise<DriveItem[]> {
  
  if (currentDepth >= maxDepth || results.length > 200) {
    return results
  }

  try {
    const encodedFolderPath = encodePath(folderPath)
    const apiUrl = `${apiConfig.driveApi}/root${encodedFolderPath}/children`
    
    const { data } = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,name,file,folder,parentReference',
        top: 200,
      },
    })

    const items = data.value || []
    const queryLower = searchQuery.toLowerCase().trim()
    
    for (const item of items) {
      // Check if file/folder name matches search query (case insensitive)
      if (item.name.toLowerCase().includes(queryLower)) {
        // Add full path information
        const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name
        results.push({
          ...item,
          path: fullPath,
          parentReference: {
            path: `/drive/root:${siteConfig.baseDirectory}${folderPath}`
          }
        })
      }
      
      // If it's a folder, search recursively
      if (item.folder && currentDepth < maxDepth - 1) {
        const subFolderPath = folderPath ? `${folderPath}/${item.name}` : item.name
        await recursiveSearch(
          accessToken, 
          searchQuery, 
          subFolderPath, 
          results, 
          maxDepth, 
          currentDepth + 1
        )
      }
    }
  } catch (error) {
    console.log(`Error searching folder ${folderPath}:`, error)
  }

  return results
}

/**
 * Alternative faster search using OneDrive's drive endpoint
 * This searches specific user's drive directly
 */
async function directDriveSearch(
  accessToken: string,
  searchQuery: string
): Promise<DriveItem[]> {
  try {
    // Get user info first
    const { data: userInfo } = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    const userPrincipalName = userInfo.userPrincipalName || siteConfig.userPrincipalName
    
    // Direct search using user's drive
    const searchUrl = `https://graph.microsoft.com/v1.0/users/${userPrincipalName}/drive/root:${siteConfig.baseDirectory}:/search(q='${encodeURIComponent(searchQuery)}')`
    
    const { data } = await axios.get(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,name,file,folder,parentReference',
        top: 100,
      },
    })

    return data.value || []
  } catch (error) {
    console.log('Direct drive search failed:', error)
    return []
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set edge function caching
  res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

  const { q: searchQuery = '' } = req.query

  if (typeof searchQuery !== 'string') {
    res.status(400).json({ error: 'Invalid search query' })
    return
  }

  if (searchQuery.trim() === '') {
    res.status(200).json([])
    return
  }

  try {
    const accessToken = await getAccessToken()

    if (!accessToken) {
      res.status(403).json({ 
        error: 'No access token. Please go to /tokenrestore to re-authenticate.',
        tokenExpired: true 
      })
      return
    }

    console.log(`Searching for: "${searchQuery}" in directory: ${siteConfig.baseDirectory}`)

    let results: DriveItem[] = []

    // Method 1: Try direct drive search first (fastest)
    try {
      results = await directDriveSearch(accessToken, searchQuery)
      console.log(`Direct search found ${results.length} results`)
    } catch (error) {
      console.log('Direct search failed, trying recursive search')
    }

    // Method 2: If direct search fails or returns no results, use recursive search
    if (results.length === 0) {
      console.log('Starting recursive search...')
      results = await recursiveSearch(accessToken, searchQuery, '', [], 4, 0)
      console.log(`Recursive search found ${results.length} results`)
    }

    // Method 3: If still no results, try basic Graph API search as fallback
    if (results.length === 0) {
      try {
        const searchRootPath = encodePath('/')
        const encodedPath = searchRootPath === '' ? searchRootPath : searchRootPath + ':'
        const searchApi = `${apiConfig.driveApi}/root${encodedPath}/search(q='${encodeURIComponent(searchQuery)}')`
        
        const { data } = await axios.get(searchApi, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            select: 'id,name,file,folder,parentReference',
            top: siteConfig.maxItems,
          },
        })
        
        results = data.value || []
        console.log(`Fallback search found ${results.length} results`)
      } catch (fallbackError) {
        console.log('All search methods failed')
      }
    }

    res.status(200).json(results)
  } catch (error: any) {
    console.error('Search API error:', error?.response?.data || error.message)
    
    if (error?.response?.status === 401) {
      res.status(401).json({ 
        error: 'Access token expired. Please go to /tokenrestore to re-authenticate.',
        tokenExpired: true 
      })
    } else {
      res.status(error?.response?.status ?? 500).json({ 
        error: error?.response?.data?.error?.message || error?.response?.data || 'Internal server error.',
        tokenExpired: false 
      })
    }
  }
}
