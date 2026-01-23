import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

/**
 * Alphapolis Novel Plugin
 * Based strictly on the provided DOM structure.
 */
class Alphapolis implements Plugin.PluginBase {
  id = 'alphapolis';
  name = 'Alphapolis';
  version = '1.0.0';
  icon = 'src/jp/alphapolis/icon.png';
  site = 'https://www.alphapolis.co.jp';
  novelDomain = 'https://www.alphapolis.co.jp';

  // Alphapolis does not expose a simple popular list without auth
  async popularNovels(_pageNo: number): Promise<Plugin.NovelItem[]> {
    return [];
  }

  // Search exists but is JS-heavy; omitted for stability
  async searchNovels(
    _searchTerm: string,
    _pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return [];
  }

  /**
   * Accepts:
   * - Novel TOC URL
   * - Any episode URL
   */
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    if (novelPath.startsWith('http')) {
      novelPath = novelPath.replace(this.novelDomain, '');
    }

    // Normalize to TOC page
    // /novel/{authorId}/{novelId}
    const parts = novelPath.split('/').filter(Boolean);
    if (parts.length >= 3 && parts[0] === 'novel') {
      novelPath = `/novel/${parts[1]}/${parts[2]}`;
    }

    const res = await fetchApi(this.novelDomain + novelPath);
    const body = await res.text();
    const $ = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('.cover.novels .title').text().trim(),
      author: $('.cover.novels .author a').first().text().trim(),
      artist: '',
      cover: defaultCover,
      status: 'Unknown',
      summary: $('.cover.novels .abstract').html() || '',
      genres: $('.content-tags .tag a')
        .map((_, el) => $(el).text().trim())
        .get()
        .join(', '),
      chapters: [],
    };

    // Episodes are inside .novels.table-of-contents .episodes
    $('.novels.table-of-contents .episodes .episode a').each((_, el) => {
      const a = $(el);
      const title = a.find('.title').text().trim();
      const href = a.attr('href');
      const date = a.find('.open-date').text().trim();

      if (!href || !title) return;

      novel.chapters.push({
        name: title,
        path: href,
        releaseTime: date,
      });
    });

    if (novel.chapters.length === 0) {
      throw new Error('No episodes found on Alphapolis page');
    }

    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    if (chapterPath.startsWith('http')) {
      chapterPath = chapterPath.replace(this.novelDomain, '');
    }

    const res = await fetchApi(this.novelDomain + chapterPath);
    const body = await res.text();
    const $ = loadCheerio(body);

    const title =
      $('h1, h2').first().text().trim() ||
      $('.episode-title').text().trim() ||
      'Chapter';

    let content = '';

    // Alphapolis episode body
    $('.episode-body p, .novel-body p, .content-main p').each((_, el) => {
      content += `<p>${$(el).html()}</p>`;
    });

    if (!content) {
      content = $('.episode-body, .novel-body, .content-main').html() || '';
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

export default new Alphapolis();
