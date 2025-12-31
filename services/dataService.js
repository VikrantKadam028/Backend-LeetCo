const GitHubFetcher = require('./githubFetcher');
const CSVParser = require('./csvParser');
const Normalizer = require('./normalizer');
const logger = require('../utils/logger');

class DataService {
  constructor() {
    this.problemMap = new Map(); // slug -> problem data
    this.titleMap = new Map(); // normalized title -> slug
    this.lastUpdated = null;
    this.totalProblems = 0;
    this.totalCompanies = 0;
  }

  async initialize() {
    await this.updateData();
  }

  async updateData() {
    try {
      logger.info('Fetching data from GitHub...');
      const repoData = await GitHubFetcher.fetchRepository();
      
      logger.info('Parsing CSV files...');
      const parsedData = await CSVParser.parseAllCSVs(repoData);
      
      logger.info('Building problem index...');
      this.buildProblemIndex(parsedData);
      
      this.lastUpdated = new Date().toISOString();
      logger.info(`Data update complete. Total problems: ${this.totalProblems}, Companies: ${this.totalCompanies}`);
    } catch (error) {
      logger.error('Failed to update data:', error);
      throw error;
    }
  }

  buildProblemIndex(parsedData) {
    const problemMap = new Map();
    const titleMap = new Map();
    const companiesSet = new Set();

    // Process each company's data
    for (const [companyName, timeRanges] of Object.entries(parsedData)) {
      companiesSet.add(companyName);

      for (const [timeRange, problems] of Object.entries(timeRanges)) {
        for (const problem of problems) {
          const slug = Normalizer.titleToSlug(problem.title);
          const normalizedTitle = Normalizer.normalizeTitle(problem.title);

          // Initialize problem entry if it doesn't exist
          if (!problemMap.has(slug)) {
            problemMap.set(slug, {
              problem: problem.title,
              slug: slug,
              companies: []
            });
            titleMap.set(normalizedTitle, slug);
          }

          // Get existing problem data
          const problemData = problemMap.get(slug);
          
          // Check if company already exists in this problem's data
          let companyEntry = problemData.companies.find(c => c.name === companyName);
          
          if (!companyEntry) {
            companyEntry = {
              name: companyName,
              frequency: 0,
              timeRanges: {}
            };
            problemData.companies.push(companyEntry);
          }

          // Update frequency and time range data
          if (problem.frequency) {
            companyEntry.frequency = Math.max(companyEntry.frequency, problem.frequency);
          }
          
          companyEntry.timeRanges[timeRange] = true;
          
          // Set last_seen to the shortest time range
          const ranges = Object.keys(companyEntry.timeRanges);
          companyEntry.last_seen = this.getShortestRange(ranges);
        }
      }
    }

    // Sort companies by frequency for each problem
    for (const problemData of problemMap.values()) {
      problemData.companies.sort((a, b) => b.frequency - a.frequency);
    }

    this.problemMap = problemMap;
    this.titleMap = titleMap;
    this.totalProblems = problemMap.size;
    this.totalCompanies = companiesSet.size;
  }

  getShortestRange(ranges) {
    const order = ['30-days', '60-days', '90-days', 'all-time'];
    for (const range of order) {
      if (ranges.includes(range)) {
        return range;
      }
    }
    return 'all-time';
  }

  queryBySlug(slug, timeRange = null) {
    const normalizedSlug = Normalizer.normalizeSlug(slug);
    const problemData = this.problemMap.get(normalizedSlug);

    if (!problemData) {
      return null;
    }

    return this.filterByTimeRange(problemData, timeRange);
  }

  queryByTitle(title, timeRange = null) {
    const normalizedTitle = Normalizer.normalizeTitle(title);
    const slug = this.titleMap.get(normalizedTitle);

    if (!slug) {
      return null;
    }

    return this.queryBySlug(slug, timeRange);
  }

  filterByTimeRange(problemData, timeRange) {
    if (!timeRange) {
      return JSON.parse(JSON.stringify(problemData)); // Deep clone
    }

    const rangeMap = {
      '30': '30-days',
      '60': '60-days',
      '90': '90-days',
      'all': 'all-time'
    };

    const targetRange = rangeMap[timeRange] || timeRange;
    
    // Determine which ranges to include based on target
    const includedRanges = this.getIncludedRanges(targetRange);

    const filtered = {
      problem: problemData.problem,
      slug: problemData.slug,
      companies: problemData.companies
        .filter(company => {
          return includedRanges.some(range => company.timeRanges[range]);
        })
        .map(company => ({
          name: company.name,
          frequency: company.frequency,
          last_seen: company.last_seen
        }))
    };

    return filtered;
  }

  getIncludedRanges(targetRange) {
    const rangeHierarchy = {
      '30-days': ['30-days'],
      '60-days': ['30-days', '60-days'],
      '90-days': ['30-days', '60-days', '90-days'],
      'all-time': ['30-days', '60-days', '90-days', 'all-time']
    };

    return rangeHierarchy[targetRange] || ['30-days', '60-days', '90-days', 'all-time'];
  }

  searchProblems(query, limit = 10) {
    const normalizedQuery = query.toLowerCase().trim();
    const results = [];

    for (const [slug, data] of this.problemMap.entries()) {
      if (data.problem.toLowerCase().includes(normalizedQuery) || 
          slug.includes(normalizedQuery)) {
        results.push({
          problem: data.problem,
          slug: data.slug,
          companyCount: data.companies.length
        });

        if (results.length >= limit) break;
      }
    }

    return results;
  }

  getStatus() {
    return {
      lastUpdated: this.lastUpdated,
      totalProblems: this.totalProblems,
      totalCompanies: this.totalCompanies
    };
  }
}

module.exports = new DataService();