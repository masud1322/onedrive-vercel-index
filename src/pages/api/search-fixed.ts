import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { encodePath, getAccessToken } from '.'
import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'

interface SearchResult {
  id: string
  name: string
  file?: any
  folder?: any
  parentReference: {
    path?: string
  }
  path?: string
  fullPath?: string
}

/**
 * Get all files using folder ID directly (bypasses path access issues)
 */
async function getAllFilesByFolderId(
  accessToken: string,
  folderId: string,
  folderPath: string = '',
  allFiles: SearchResult[] = [],
  maxDepth: number = 5,
  currentDepth: number = 0
): Promise<SearchResult[]> {
  
  if (currentDepth >= maxDepth || allFiles.length > 1000) {
    return allFiles
  }

  try {
    // Use direct folder ID access instead of path
    const apiUrl = `${apiConfig.driveApi}/items/${folderId}/children`
    
    let allItems: any[] = []
    let nextLink = null
    
    // Handle pagination
    do {
      const requestUrl = nextLink || apiUrl
      const { data } = await axios.get(requestUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: nextLink ? {} : {
          select: 'id,name,file,folder,parentReference',
          top: 999,
        },
      })

      allItems.push(...(data.value || []))
      nextLink = data['@odata.nextLink'] || null
      
    } while (nextLink && allItems.length < 5000)

    console.log(`Found ${allItems.length} items in folder ID: ${folderId}`)

    // Process all items
    for (const item of allItems) {
      const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name
      
      // Add to results
      allFiles.push({
        ...item,
        path: fullPath,
        fullPath: `${siteConfig.baseDirectory}${fullPath}`,
        parentReference: {
          path: `/drive/root:${siteConfig.baseDirectory}${folderPath}`
        }
      })
      
      // Recurse into subfolders
      if (item.folder && currentDepth < maxDepth - 1) {
        await getAllFilesByFolderId(
          accessToken,
          item.id, // Use the subfolder's ID
          fullPath,
          allFiles,
          maxDepth,
          currentDepth + 1
        )
      }
    }
  } catch (error) {
    console.log(`Error accessing folder ID ${folderId}:`, error)
  }

  return allFiles
}

/**
 * Get the base folder ID first, then access its contents
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

    console.log(`Base folder ID: ${data.id}, Name: ${data.name}`)
    return data.id
  } catch (error) {
    console.log('Failed to get base folder ID:', error)
    return null
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-cache')

  const { q: searchQuery = '', debug = 'false' } = req.query

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
    
    // Step 1: Get base folder ID
    const baseFolderId = await getBaseFolderId(accessToken)
    
    if (!baseFolderId) {
      res.status(500).json({ error: 'Could not access base directory' })
      return
    }

    // Step 2: Get all files using folder ID
    console.log('Getting all files using folder ID method...')
    const allFiles = await getAllFilesByFolderId(accessToken, baseFolderId, '', [], 4, 0)
    
    console.log(`Total files found: ${allFiles.length}`)

    // Step 3: Filter results
    const queryLower = searchQuery.toLowerCase().trim()
    const results = allFiles.filter(file => 
      file.name.toLowerCase().includes(queryLower)
    )

    console.log(`Filtered results: ${results.length} matching "${searchQuery}"`)
    
    // Sort results by relevance
    results.sort((a, b) => {
      const aName = a.name.toLowerCase()
      const bName = b.name.toLowerCase()
      const query = searchQuery.toLowerCase()
      
      // Exact matches first
      if (aName === query && bName !== query) return -1
      if (bName === query && aName !== query) return 1
      
      // Starts with query
      if (aName.startsWith(query) && !bName.startsWith(query)) return -1
      if (bName.startsWith(query) && !aName.startsWith(query)) return 1
      
      // Alphabetical
      return aName.localeCompare(bName)
    })

    const responseData = {
      results: results.slice(0, 100),
      total: results.length,
      totalFiles: allFiles.length,
      query: searchQuery,
      searchedFrom: siteConfig.baseDirectory,
      baseFolderId: baseFolderId,
      method: 'folder-id-direct-access'
    }

    if (debug === 'true') {
      responseData['debugInfo'] = {
        allFileNames: allFiles.slice(0, 20).map(f => f.name),
        matchingFileNames: results.map(f => f.name)
      }
    }

    res.status(200).json(responseData)

  } catch (error: any) {
    console.error('Fixed search error:', error?.response?.data || error.message)
    
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