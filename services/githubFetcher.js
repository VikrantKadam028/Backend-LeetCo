const axios = require('axios');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class GitHubFetcher {
  constructor() {
    this.repoOwner = 'liquidslr';
    this.repoName = 'leetcode-company-wise-problems';
    this.zipUrl = `https://github.com/${this.repoOwner}/${this.repoName}/archive/refs/heads/main.zip`;
    this.dataDir = path.join(__dirname, '../data');
    this.rawDir = path.join(this.dataDir, 'raw');
    
    // Map actual file names to standardized time ranges
    this.fileMapping = {
      '1. Thirty Days.csv': '30-days',
      '2. Three Months.csv': '90-days',
      '3. Six Months.csv': '180-days',
      '4. More Than Six Months.csv': 'all-time',
      '5. All.csv': 'all-time',
      // Fallback without numbers (just in case)
      'Thirty Days.csv': '30-days',
      'Three Months.csv': '90-days',
      'Six Months.csv': '180-days',
      'More Than Six Months.csv': 'all-time',
      'All.csv': 'all-time'
    };
  }

  async fetchRepository() {
    try {
      // Ensure directories exist
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(this.rawDir, { recursive: true });

      logger.info('Downloading repository ZIP from GitHub...');
      const response = await axios({
        method: 'get',
        url: this.zipUrl,
        responseType: 'arraybuffer',
        timeout: 120000, // 2 minutes
        maxContentLength: 100 * 1024 * 1024, // 100MB
        headers: {
          'User-Agent': 'LeetCode-Company-API/1.0',
          'Accept': 'application/zip'
        }
      });

      logger.info(`Downloaded ${(response.data.length / 1024 / 1024).toFixed(2)} MB`);
      logger.info('Extracting ZIP file...');
      
      const zip = new AdmZip(response.data);
      const zipEntries = zip.getEntries();

      logger.info(`Total entries in ZIP: ${zipEntries.length}`);
      
      // DEBUG: Log first 20 entries to understand structure
      logger.info('Sample of ZIP contents:');
      zipEntries.slice(0, 20).forEach(entry => {
        logger.info(`  ${entry.isDirectory ? '[DIR]' : '[FILE]'} ${entry.entryName}`);
      });

      const repoData = {};
      let csvCount = 0;
      let skippedCount = 0;

      // Process each entry in the ZIP
      for (const entry of zipEntries) {
        // Skip directories
        if (entry.isDirectory) {
          continue;
        }

        // Only process CSV files
        if (!entry.entryName.endsWith('.csv')) {
          continue;
        }
        
        logger.debug(`Processing CSV: ${entry.entryName}`);

        // Parse the path structure
        // Expected: leetcode-company-wise-problems-main/CompanyName/FileName.csv
        const parts = entry.entryName.split('/');
        
        logger.debug(`  Path parts (${parts.length}): ${parts.join(' / ')}`);
        
        if (parts.length < 3) {
          logger.debug(`Skipping invalid path: ${entry.entryName} (not enough parts)`);
          skippedCount++;
          continue;
        }

        // Extract company name (second to last part)
        const companyName = parts[parts.length - 2];
        
        // Extract file name
        const fileName = parts[parts.length - 1];

        // Check if this is a valid file we want to process
        const timeRange = this.fileMapping[fileName];
        
        if (!timeRange) {
          logger.debug(`Skipping unrecognized file: ${fileName} in ${companyName}`);
          skippedCount++;
          continue;
        }

        // Initialize company data structure
        if (!repoData[companyName]) {
          repoData[companyName] = {};
          logger.debug(`  New company: ${companyName}`);
        }

        // Get CSV content
        const content = entry.getData().toString('utf8');
        repoData[companyName][timeRange] = content;

        csvCount++;
        logger.info(`✓ Loaded: ${companyName}/${fileName} -> ${timeRange}`);
      }

      const companyCount = Object.keys(repoData).length;
      logger.info(`✅ Successfully loaded ${csvCount} CSV files from ${companyCount} companies`);
      logger.info(`Skipped ${skippedCount} files`);

      if (companyCount === 0) {
        logger.error('No company data found. Listing all CSV files found:');
        zipEntries.forEach(entry => {
          if (entry.entryName.endsWith('.csv')) {
            logger.error(`  Found CSV: ${entry.entryName}`);
          }
        });
        throw new Error('No company data found in repository. Check file structure.');
      }

      // Log sample of what was loaded
      const sampleCompanies = Object.keys(repoData).slice(0, 5);
      logger.info(`Sample companies: ${sampleCompanies.join(', ')}`);

      return repoData;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        logger.error('GitHub download timed out. Please check your internet connection.');
      } else if (error.response) {
        logger.error(`GitHub API error: ${error.response.status} ${error.response.statusText}`);
      } else {
        logger.error('Failed to fetch repository:', error.message);
      }
      throw new Error(`GitHub fetch failed: ${error.message}`);
    }
  }

  // Alternative method: Use GitHub API to fetch file list first
  async fetchRepositoryViaAPI() {
    try {
      logger.info('Fetching repository tree via GitHub API...');
      
      const treeUrl = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/git/trees/main?recursive=1`;
      
      const treeResponse = await axios({
        method: 'get',
        url: treeUrl,
        headers: {
          'User-Agent': 'LeetCode-Company-API/1.0',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      const repoData = {};
      const csvFiles = treeResponse.data.tree.filter(item => 
        item.type === 'blob' && item.path.endsWith('.csv')
      );

      logger.info(`Found ${csvFiles.length} CSV files, downloading...`);

      for (const file of csvFiles) {
        const parts = file.path.split('/');
        if (parts.length < 2) continue;

        const companyName = parts[parts.length - 2];
        const fileName = parts[parts.length - 1];
        const timeRange = this.fileMapping[fileName];

        if (!timeRange) continue;

        // Download individual file
        const rawUrl = `https://raw.githubusercontent.com/${this.repoOwner}/${this.repoName}/main/${file.path}`;
        
        try {
          const response = await axios.get(rawUrl);
          
          if (!repoData[companyName]) {
            repoData[companyName] = {};
          }
          
          repoData[companyName][timeRange] = response.data;
          logger.debug(`✓ ${companyName}/${fileName}`);
        } catch (err) {
          logger.warn(`Failed to download ${file.path}: ${err.message}`);
        }
      }

      logger.info(`✅ Successfully loaded data for ${Object.keys(repoData).length} companies`);
      return repoData;
    } catch (error) {
      logger.error('GitHub API fetch failed:', error.message);
      throw error;
    }
  }
}

module.exports = new GitHubFetcher();