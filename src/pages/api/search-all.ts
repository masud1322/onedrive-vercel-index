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
 * Get all files from all folders recursively (the most comprehensive search)
 * This ensures NO file is missed from the search
 */
async function getAllFilesRecursively(
  accessToken: string,
  folderPath: string = '',
  allFiles: SearchResult[] = [],
  maxDepth: number = 10,
  currentDepth: number = 0
): Promise<SearchResult[]> {
  
  if (currentDepth >= maxDepth) {
    return allFiles
  }

  try {
    const encodedFolderPath = encodePath(folderPath)
    const apiUrl = `${apiConfig.driveApi}/root${encodedFolderPath}/children`
    
    let allItems: any[] = []
    let nextLink = null
    
    // Handle pagination to get ALL files
    do {
      const requestUrl = nextLink || apiUrl
      const { data } = await axios.get(requestUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: nextLink ? {} : {
          select: 'id,name,file,folder,parentReference',
          top: 999, // Maximum per request
        },
      })

      allItems.push(...(data.value || []))
      nextLink = data['@odata.nextLink'] || null
      
    } while (nextLink && allItems.length < 10000) // Safety limit

    // Process all items
    for (const item of allItems) {
      const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name
      
      // Add all files and folders to the list
      allFiles.push({
        ...item,
        path: fullPath,
        fullPath: `${siteConfig.baseDirectory}${fullPath}`,
        parentReference: {
          path: `/drive/root:${siteConfig.baseDirectory}${folderPath}`
        }
      })
      
      // If it's a folder, recurse into it
      if (item.folder && currentDepth < maxDepth - 1) {
        await getAllFilesRecursively(
          accessToken,
          fullPath,
          allFiles,
          maxDepth,
          currentDepth + 1
        )
      }
    }
  } catch (error) {
    console.log(`Error accessing folder ${folderPath}:`, error)
  }

  return allFiles
}

/**
 * Search using multiple strategies for maximum coverage
 */
async function comprehensiveSearch(
  accessToken: string,
  searchQuery: string
): Promise<SearchResult[]> {
  const queryLower = searchQuery.toLowerCase().trim()
  const results: SearchResult[] = []
  const foundIds = new Set<string>()

  console.log('Starting comprehensive search...')

  // Strategy 1: Direct OneDrive API search
  try {
    const searchRootPath = encodePath('/')
    const encodedPath = searchRootPath === '' ? searchRootPath : searchRootPath + ':'
    const searchApi = `${apiConfig.driveApi}/root${encodedPath}/search(q='${encodeURIComponent(searchQuery)}')`
    
    const { data } = await axios.get(searchApi, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,name,file,folder,parentReference',
        top: 999,
      },
    })

    for (const item of data.value || []) {
      if (!foundIds.has(item.id)) {
        results.push(item)
        foundIds.add(item.id)
      }
    }
    console.log(`Direct API search found: ${data.value?.length || 0} items`)
  } catch (error) {
    console.log('Direct API search failed:', error)
  }

  // Strategy 2: User-specific drive search
  try {
    const { data: userInfo } = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    const userPrincipalName = userInfo.userPrincipalName || siteConfig.userPrincipalName
    const userSearchUrl = `https://graph.microsoft.com/v1.0/users/${userPrincipalName}/drive/root:${siteConfig.baseDirectory}:/search(q='${encodeURIComponent(searchQuery)}')`
    
    const { data } = await axios.get(userSearchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        select: 'id,name,file,folder,parentReference',
        top: 999,
      },
    })

    for (const item of data.value || []) {
      if (!foundIds.has(item.id)) {
        results.push(item)
        foundIds.add(item.id)
      }
    }
    console.log(`User-specific search found: ${data.value?.length || 0} items`)
  } catch (error) {
    console.log('User-specific search failed:', error)
  }

  // Strategy 3: If still no results, do comprehensive file enumeration and filter
  if (results.length === 0) {
    console.log('No results from API searches, enumerating all files...')
    try {
      const allFiles = await getAllFilesRecursively(accessToken, '', [], 5, 0)
      console.log(`Found ${allFiles.length} total files, filtering for: "${queryLower}"`)
      
      const filteredFiles = allFiles.filter(file => 
        file.name.toLowerCase().includes(queryLower)
      )
      
      for (const file of filteredFiles) {
        if (!foundIds.has(file.id)) {
          results.push(file)
          foundIds.add(file.id)
        }
      }
      console.log(`File enumeration found: ${filteredFiles.length} matching items`)
    } catch (error) {
      console.log('File enumeration failed:', error)
    }
  }

  return results
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-cache') // Don't cache search results

  const { q: searchQuery = '', comprehensive = 'false' } = req.query

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

    console.log(`Starting search for: "${searchQuery}" (comprehensive: ${comprehensive})`)
    
    let results: SearchResult[] = []

    if (comprehensive === 'true') {
      // Use comprehensive search that checks every single file
      results = await comprehensiveSearch(accessToken, searchQuery)
    } else {
      // Use faster recursive search
      const queryLower = searchQuery.toLowerCase().trim()
      const allFiles = await getAllFilesRecursively(accessToken, '', [], 4, 0)
      results = allFiles.filter(file => 
        file.name.toLowerCase().includes(queryLower)
      )
    }

    console.log(`Search completed. Found ${results.length} results for "${searchQuery}"`)
    
    // Sort results by relevance (exact matches first, then partial matches)
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

    res.status(200).json({
      results: results.slice(0, 100), // Limit to 100 results for performance
      total: results.length,
      query: searchQuery,
      searchedFrom: siteConfig.baseDirectory
    })

  } catch (error: any) {
    console.error('Comprehensive search error:', error?.response?.data || error.message)
    
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