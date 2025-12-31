const Papa = require('papaparse');
const logger = require('../utils/logger');

class CSVParser {
  parseCSV(csvContent) {
    try {
      const result = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        transformHeader: (header) => header.trim().toLowerCase()
      });

      if (result.errors.length > 0) {
        logger.warn('CSV parse warnings:', result.errors);
      }

      return result.data;
    } catch (error) {
      logger.error('CSV parse error:', error);
      return [];
    }
  }

  async parseAllCSVs(repoData) {
    const parsedData = {};

    for (const [companyName, timeRanges] of Object.entries(repoData)) {
      parsedData[companyName] = {};

      for (const [timeRange, csvContent] of Object.entries(timeRanges)) {
        const rows = this.parseCSV(csvContent);
        const problems = this.extractProblems(rows);
        
        parsedData[companyName][timeRange] = problems;
        
        logger.debug(`Parsed ${companyName}/${timeRange}: ${problems.length} problems`);
      }
    }

    return parsedData;
  }

  extractProblems(rows) {
    const problems = [];
    const seen = new Set();

    for (const row of rows) {
      // Handle various possible column names
      const title = this.extractTitle(row);
      const frequency = this.extractFrequency(row);

      if (!title) continue;

      // Deduplicate within the same file
      const key = title.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);

      problems.push({
        title: title.trim(),
        frequency: frequency
      });
    }

    return problems;
  }

  extractTitle(row) {
    // Try various possible column names
    const titleKeys = [
      'title',
      'problem',
      'problem title',
      'question',
      'question title',
      'name'
    ];

    for (const key of titleKeys) {
      if (row[key] && typeof row[key] === 'string') {
        return row[key];
      }
    }

    // If no match, try to find any column with string values
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    return null;
  }

  extractFrequency(row) {
    const freqKeys = [
      'frequency',
      'freq',
      'count',
      'occurrences'
    ];

    for (const key of freqKeys) {
      if (row[key] !== undefined && row[key] !== null) {
        const freq = parseInt(row[key], 10);
        if (!isNaN(freq)) {
          return freq;
        }
      }
    }

    return 1; // Default frequency
  }
}

module.exports = new CSVParser();