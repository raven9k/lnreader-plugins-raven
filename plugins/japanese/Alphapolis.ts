import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

/**
 * Alphapolis Novel Plugin
 * DOM-accurate, chapter-numbered, LNReader-safe
 */
class Alphapolis implements Plugin.PluginBase {
  id = 'alphapolis';
  name = 'Alphapolis';
  version = '1.2.0';
  icon = 'src/jp/alphapolis/icon.png';
  site = 'https://www.alphapolis.co.jp';
  novelDomain = 'https://www.alphapolis.co.jp';

  async popularNovels(): Promise<Plugin.NovelItem[]> {
    return [];
  }

  async searchNovels(): Promise<Plugin.NovelItem[]> {
    return [];
  }

  /**
   * Parse novel TOC
   * Supports:
   * - <h3> arc titles
   * - .episodes .episode chapter entries
   * - Sequential chapter numbering
   */
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    if (novelPath.startsWith('http')) {
      novelPath = novelPath.replace(this.novelDomain, '');
    }

    // Normalize to /novel/{authorId}/{novelId}
    const parts = novelPath.split('/').filter(Boolean);
    if (parts[0] === 'novel' && parts.length >= 3) {
      novelPath = `/novel/${parts[1]}/${parts[2]}`;
    }

    const res = await fetchApi(this.novelDomain + novelPath);
    const html = await res.text();
    const $ = loadCheerio(html);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('.cover .title, h1').first().text().trim(),
      author: $('.cover .author a').first().text().trim(),
      artist: '',
      cover: defaultCover,
      status: 'Unknown',
      summary: $('.abstract').html() || '',
      genres: $('.tag a')
        .map((_, el) => $(el).text().trim())
        .get()
        .join(', '),
      chapters: [],
    };

    let chapterIndex = 1;
    let currentArc = '';

    // Walk through children of .episodes in order
    $('.episodes')
      .children()
      .each((_, el) => {
        const node = $(el);

        // Arc / Volume title
        if (node.is('h3')) {
          currentArc = node.text().trim();
          return;
        }

        // Episode entry
        if (node.hasClass('episode')) {
          const a = node.find('a');
          const rawTitle = a.find('.title').text().trim();
          const href = a.attr('href');
          const date = a.find('.open-date').text().trim();

          if (!href || !rawTitle) return;

          const finalTitle = currentArc
            ? `Chapter ${chapterIndex} — ${currentArc}`
            : `Chapter ${chapterIndex}`;

          novel.chapters.push({
            name: finalTitle,
            path: href,
            releaseTime: date,
          });

          chapterIndex++;
        }
      });

    if (!novel.chapters.length) {
      throw new Error('No chapters found on Alphapolis page');
    }

    return novel;
  }

  /**
   * Parse individual chapter
   * Title: h2.episode-title
   * Content: #novelBody.text
   */
  async parseChapter(chapterPath: string): Promise<string> {
    if (chapterPath.startsWith('http')) {
      chapterPath = chapterPath.replace(this.novelDomain, '');
    }

    const res = await fetchApi(this.novelDomain + chapterPath);
    const html = await res.text();
    const $ = loadCheerio(html);

    const title =
      $('h2.episode-title').text().trim() ||
      $('title').text().trim() ||
      'Chapter';

    let content = '';

    $('#novelBody.text p').each((_, el) => {
      content += `<p>${$(el).html()}</p>`;
    });

    // Fallback for chapters without <p>
    if (!content) {
      content = $('#novelBody.text').html() || '';
    }

    if (!content) {
      throw new Error('Failed to parse Alphapolis chapter content');
    }

    return `<h2>${title}</h2>${content}`;
  }

  resolveUrl(path: string): string {
    return path.startsWith('http') ? path : this.novelDomain + path;
  }
}

export default new Alphapolis();
