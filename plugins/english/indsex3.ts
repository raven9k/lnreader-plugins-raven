import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

/**
 * IndianSexStories3 plugin
 *
 * Site characteristics:
 * - Single-page stories (no chapter list)
 * - Each story is one complete chapter
 * - User pastes the story URL directly
 */
class IndianSexStories3 implements Plugin.PluginBase {
  id = 'indiansexstories3';
  name = 'IndianSexStories3';
  version = '1.0.0';
  icon = 'src/en/indsex3/icon.png';
  site = 'https://www.indiansexstories3.com';
  novelDomain = 'https://www.indiansexstories3.com';

  // No homepage listing suitable for novels
  async popularNovels(_pageNo: number): Promise<Plugin.NovelItem[]> {
    return [];
  }

  // Site search is unreliable / category-based
  async searchNovels(
    _searchTerm: string,
    _pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return [];
  }

  /**
   * Parse a story as a single-chapter novel
   */
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    if (novelPath.startsWith('http')) {
      novelPath = novelPath.replace(this.novelDomain, '');
    }

    const res = await fetchApi(this.novelDomain + novelPath);
    const body = await res.text();
    const $ = loadCheerio(body);

    const title = $('h1.post-title').first().text().trim();
    const author = $('.meta-author a').first().text().trim() || '';

    if (!title) {
      throw new Error('Failed to parse story title');
    }

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: title,
      author,
      artist: '',
      cover: defaultCover(title),
      status: 'Unknown',
      summary: '',
      genres: '',
      chapters: [
        {
          name: 'Story',
          path: novelPath,
          releaseTime: '',
        },
      ],
    };

    return novel;
  }

  /**
   * Parse the story content
   */
  async parseChapter(chapterPath: string): Promise<string> {
    if (chapterPath.startsWith('http')) {
      chapterPath = chapterPath.replace(this.novelDomain, '');
    }

    const res = await fetchApi(this.novelDomain + chapterPath);
    const body = await res.text();
    const $ = loadCheerio(body);

    const title = $('h1.post-title').first().text().trim() || 'Story';

    const contentRoot = $('section.story-content').first().clone();

    if (!contentRoot.length) {
      throw new Error('Story content not found');
    }

    // Remove ads / junk
    contentRoot
      .find(
        'script, iframe, .visible-xs, .visible-sm, .visible-md, .visible-lg, .adsbygoogle',
      )
      .remove();

    let content = '';
    contentRoot.find('p').each((_, el) => {
      const html = $(el).html();
      if (html) content += `<p>${html}</p>`;
    });

    if (!content) {
      throw new Error('Failed to parse story content');
    }

    return `<h1>${title}</h1>${content}`;
  }

  resolveUrl(path: string): string {
    if (path.startsWith('http')) return path;
    return this.novelDomain + path;
  }
}

export default new IndianSexStories3();
