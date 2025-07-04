import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { encodePath, getAccessToken, checkAuthRoute } from '.'
import { matchProtectedRoute } from '../../utils/protectedRouteHandler'
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
 * Check if a folder path is protected and if user has access
 * @param folderPath The path to check
 * @param accessToken OneDrive access token for API calls
 * @param req The request object to check for authentication headers
 * @returns Promise<boolean> indicating if the folder can be searched
 */
async function canAccessFolder(folderPath: string, accessToken: string, req: NextApiRequest): Promise<boolean> {
  // Clean the folder path similar to main API
  const cleanPath = folderPath.startsWith('/') ? folderPath.replace(/\/$/, '') : `/${folderPath}`.replace(/\/$/, '')
  const fullPath = `${siteConfig.baseDirectory}${cleanPath}`.replace(/\/+/g, '/')
  
  try {
    // Use the same authentication logic as main API
    const odTokenHeader = req.headers['od-protected-token'] as string
    const authResult = await checkAuthRoute(cleanPath, accessToken, odTokenHeader || '')
    
    // Only allow access if authentication passed (code 200) or route is not protected
    return authResult.code === 200
  } catch (error) {
    console.log(`Authentication check failed for folder ${folderPath}:`, error)
    return false // Deny access on any error
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

/**
 * Get the base folder ID first, then access its contents using ID
 */
async function getBaseFolderId(accessToken: string): Promise<string | null> {
  try {
    const baseEncodedPath = encodePath('/')
    const baseApiUrl = `${apiConfig.driveApi}/root${baseEncodedPath}`
    
    const { data } = await axios.get(baseApiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,name,folder',
      },
    })

    return data.id
  } catch (error) {
    console.log('Failed to get base folder ID:', error)
    return null
  }
}

/**
 * Get all files using folder ID directly (fixed method)
 */
async function getAllFilesByFolderId(
  accessToken: string,
  folderId: string,
  folderPath: string = '',
  allFiles: DriveItem[] = [],
  maxDepth: number = 4,
  currentDepth: number = 0,
  req?: NextApiRequest
): Promise<DriveItem[]> {
  
  if (currentDepth >= maxDepth || allFiles.length > 1000) {
    return allFiles
  }

  // Skip protected folders if user doesn't have access
  if (req && !(await canAccessFolder(folderPath, accessToken, req))) {
    console.log(`Skipping protected folder: ${folderPath}`)
    return allFiles
  }

  try {
    const apiUrl = `${apiConfig.driveApi}/items/${folderId}/children`
    
    const { data } = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,name,file,folder,parentReference',
        top: 999,
      },
    })

    const items = data.value || []

    for (const item of items) {
      const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name
      
      allFiles.push({
        ...item,
        path: fullPath,
        parentReference: {
          path: `/drive/root:${siteConfig.baseDirectory}${folderPath}`
        }
      })
      
      // Recurse into subfolders
      if (item.folder && currentDepth < maxDepth - 1) {
        await getAllFilesByFolderId(
          accessToken,
          item.id,
          fullPath,
          allFiles,
          maxDepth,
          currentDepth + 1,
          req
        )
      }
    }
  } catch (error) {
    console.log(`Error accessing folder ID ${folderId}:`, error)
  }

  return allFiles
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

    console.log(`Fixed search for: "${searchQuery}" in directory: ${siteConfig.baseDirectory}`)

    // NEW METHOD: Use folder ID instead of path
    const baseFolderId = await getBaseFolderId(accessToken)
    
    if (!baseFolderId) {
      res.status(500).json({ error: 'Could not access base directory' })
      return
    }

    // Get all files using the fixed folder ID method
    const allFiles = await getAllFilesByFolderId(accessToken, baseFolderId, '', [], 4, 0, req)
    console.log(`Total files found: ${allFiles.length}`)

    // Filter results
    const queryLower = searchQuery.toLowerCase().trim()
    const results = allFiles.filter(file => 
      file.name.toLowerCase().includes(queryLower)
    )

    console.log(`Filtered results: ${results.length} matching "${searchQuery}"`)

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
