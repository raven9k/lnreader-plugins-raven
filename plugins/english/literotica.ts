import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

/**
 * Literotica plugin
 *
 * Site characteristics:
 * - Stories may belong to a series (/series/se/ID)
 * - Chapters can span multiple pages (?page=2,3...)
 * - User can paste a series URL OR any chapter URL
 */
class Literotica implements Plugin.PluginBase {
  id = 'literotica';
  name = 'Literotica';
  version = '1.0.0';
  icon = 'src/en/literotica/icon.png';
  site = 'https://www.literotica.com';
  novelDomain = 'https://www.literotica.com';

  async popularNovels(_pageNo: number): Promise<Plugin.NovelItem[]> {
    const res = await fetchApi(this.site);
    const body = await res.text();
    const $ = loadCheerio(body);

    return $('.story-card, .b-story-card')
      .slice(0, 20)
      .map((_, el) => {
        const a = $(el).find('a').first();
        const title = a.text().trim();
        const href = a.attr('href');
        if (!href) return null;

        return {
          name: title,
          path: href,
          cover: defaultCover(title),
        };
      })
      .get()
      .filter(Boolean) as Plugin.NovelItem[];
  }

  async searchNovels(
    searchTerm: string,
    _pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const res = await fetchApi(
      `${this.site}/search?q=${encodeURIComponent(searchTerm)}`,
    );
    const body = await res.text();
    const $ = loadCheerio(body);

    return $('.search-result, .b-story-card')
      .map((_, el) => {
        const a = $(el).find('a').first();
        const title = a.text().trim();
        const href = a.attr('href');
        if (!href) return null;

        return {
          name: title,
          path: href,
          cover: defaultCover(title),
        };
      })
      .get()
      .filter(Boolean) as Plugin.NovelItem[];
  }

  /**
   * Parse novel (series OR single chapter)
   */
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    if (novelPath.startsWith('http')) {
      novelPath = novelPath.replace(this.novelDomain, '');
    }

    const res = await fetchApi(this.novelDomain + novelPath);
    const body = await res.text();
    const $ = loadCheerio(body);

    const title = $('h1').first().text().trim() || 'Literotica Story';
    const author = $('.author a').first().text().trim();

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: title,
      author: author || '',
      artist: '',
      cover: defaultCover(title),
      status: 'Unknown',
      summary: '',
      genres: '',
      chapters: [],
    };

    // SERIES PAGE
    if (novelPath.includes('/series/')) {
      $('.series-list a').each((_, el) => {
        const a = $(el);
        const name = a.text().trim();
        const href = a.attr('href');
        if (!href || !name) return;

        novel.chapters.push({
          name,
          path: href,
          releaseTime: '',
        });
      });

      if (!novel.chapters.length) {
        throw new Error('No chapters found in series');
      }

      return novel;
    }

    // SINGLE CHAPTER → virtual novel
    novel.chapters.push({
      name: title,
      path: novelPath,
      releaseTime: '',
    });

    return novel;
  }

  /**
   * Parse chapter (handles multi-page chapters)
   */
  async parseChapter(chapterPath: string): Promise<string> {
    if (chapterPath.startsWith('http')) {
      chapterPath = chapterPath.replace(this.novelDomain, '');
    }

    let page = 1;
    let content = '';
    let title = 'Chapter';

    while (true) {
      const url = page === 1 ? chapterPath : `${chapterPath}?page=${page}`;

      const res = await fetchApi(this.novelDomain + url);
      const body = await res.text();
      const $ = loadCheerio(body);

      if (page === 1) {
        title = $('h1').first().text().trim() || title;
      }

      const story = $('.aa_ht, .b-story-body, .story-content').first();
      if (!story.length) break;

      story.find('script, iframe, .adunit, .adsbygoogle').remove();

      story.find('p').each((_, el) => {
        content += `<p>${$(el).html()}</p>`;
      });

      const hasNext = $('.pagination a')
        .toArray()
        .some(a => $(a).text().trim() === String(page + 1));

      if (!hasNext) break;
      page++;
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

export default new Literotica();
