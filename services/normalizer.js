class Normalizer {
    /**
     * Normalize a title to lowercase and trimmed
     */
    normalizeTitle(title) {
      if (!title) return '';
      return title.toLowerCase().trim().replace(/\s+/g, ' ');
    }
  
    /**
     * Convert a title to slug format (e.g., "Two Sum" -> "two-sum")
     */
    titleToSlug(title) {
      if (!title) return '';
      
      return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    }
  
    /**
     * Normalize a slug (ensure it's in proper slug format)
     */
    normalizeSlug(slug) {
      if (!slug) return '';
      
      return slug
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-') // Convert any spaces to hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    }
  
    /**
     * Convert a slug back to a readable title (e.g., "two-sum" -> "Two Sum")
     */
    slugToTitle(slug) {
      if (!slug) return '';
      
      return slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  
    /**
     * Check if a title matches a search query
     */
    matchesQuery(title, query) {
      const normalizedTitle = this.normalizeTitle(title);
      const normalizedQuery = this.normalizeTitle(query);
      
      return normalizedTitle.includes(normalizedQuery);
    }
  
    /**
     * Try multiple normalization strategies to find a match
     */
    findBestMatch(input, titleMap, problemMap) {
      // Try as-is
      let slug = this.normalizeSlug(input);
      if (problemMap.has(slug)) {
        return slug;
      }
  
      // Try as title
      const normalizedTitle = this.normalizeTitle(input);
      if (titleMap.has(normalizedTitle)) {
        return titleMap.get(normalizedTitle);
      }
  
      // Try converting to slug from title
      slug = this.titleToSlug(input);
      if (problemMap.has(slug)) {
        return slug;
      }
  
      return null;
    }
  }
  
  module.exports = new Normalizer();