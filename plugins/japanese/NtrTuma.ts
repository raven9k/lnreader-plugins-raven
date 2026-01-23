import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

/**
 * NTRTuma plugin
 *
 * Site characteristics:
 * - No main novel page
 * - All chapters for a story are clustered in a single page
 * - Story is identified by story_id query param
 * - Chapter links are ordered by numeric prefix (e.g. 169 → latest)
 * - User can paste ANY chapter URL belonging to the story
 */
class NtrTuma implements Plugin.PluginBase {
  id = 'ntrtuma';
  name = 'NTRTuma';
  version = '1.0.0';
  icon = 'src/jp/ntrtuma/icon.png';
  site = 'https://ntrtuma.com';
  novelDomain = 'https://ntrtuma.com';

  // No real popular page
  async popularNovels(_pageNo: number): Promise<Plugin.NovelItem[]> {
    return [];
  }

  // No site-wide search
  async searchNovels(
    _searchTerm: string,
    _pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return [];
  }

  /**
   * Parse novel by story_id
   * Accepts ANY chapter URL and resolves the story_id from it
   */
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    // Allow full URL pasting
    if (novelPath.startsWith('http')) {
      novelPath = novelPath.replace(this.novelDomain, '');
    }

    // Extract story_id
    const storyMatch = novelPath.match(/story_id=(\d+)/);
    if (!storyMatch) {
      throw new Error('story_id not found in URL');
    }

    const storyId = storyMatch[1];
    const storyUrl = `/posts/?story_id=${storyId}`;

    const res = await fetchApi(this.novelDomain + storyUrl);
    const body = await res.text();
    const $ = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
      path: storyUrl,
      name: `Story ${storyId}`,
      author: '',
      artist: '',
      cover: defaultCover,
      status: 'Unknown',
      summary: '',
      genres: '',
      chapters: [],
    };

    /**
     * Chapters live inside:
     * #post-96 > div > div:nth-child(4)
     * Each chapter starts with a numeric prefix (e.g. 169, 170...)
     */
    const chapterContainer = $('#post-96 > div > div:nth-child(4)');

    if (!chapterContainer.length) {
      throw new Error('Chapter container not found');
    }

    chapterContainer.find('a').each((_, el) => {
      const a = $(el);
      const title = a.text().trim();
      const href = a.attr('href');

      if (!href || !title) return;

      novel.chapters.push({
        name: title,
        path: href,
        releaseTime: '',
      });
    });

    if (novel.chapters.length === 0) {
      throw new Error('No chapters found for this story');
    }

    return novel;
  }

  /**
   * Parse chapter content
   */
  async parseChapter(chapterPath: string): Promise<string> {
    if (chapterPath.startsWith('http')) {
      chapterPath = chapterPath.replace(this.novelDomain, '');
    }

    const res = await fetchApi(this.novelDomain + chapterPath);
    const body = await res.text();
    const $ = loadCheerio(body);

    const title = $('h1, h2').first().text().trim() || 'Chapter';

    let content = '';

    // Typical WP post content
    $('.entry-content p, .post-content p').each((_, el) => {
      content += `<p>${$(el).html()}</p>`;
    });

    if (!content) {
      // Hard fallback
      content = $('.entry-content, .post-content').html() || '';
    }

    if (!content) {
      throw new Error('Failed to parse chapter content');
    }

    return `<h1>${title}</h1>${content}`;
  }

  resolveUrl(path: string): string {
    if (path.startsWith('http')) return path;
    return this.novelDomain + path;
  }
}

export default new NtrTuma();
