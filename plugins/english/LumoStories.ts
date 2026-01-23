import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

class LumoStories implements Plugin.PluginBase {
  id = 'lumostories';
  name = 'Lumo Stories';
  icon = 'src/en/lumo/icon.png';
  version = '1.2.0';
  site = 'https://lumostories.com';
  novelDomain = 'https://lumostories.com';

  // ================================
  // Popular novels (homepage)
  // ================================
  async popularNovels(_pageNo: number): Promise<Plugin.NovelItem[]> {
    const res = await fetchApi(this.novelDomain + '/en/');
    const body = await res.text();
    const $ = loadCheerio(body);

    const novels: Plugin.NovelItem[] = [];

    $('.story-card a, .popular-story a').each((_, el) => {
      const a = $(el);
      const href = a.attr('href');
      if (!href || !href.includes('/story/')) return;

      const name = a.find('h3, .title').text().trim() || a.text().trim();

      if (!name) return;

      novels.push({
        name,
        path: href,
        cover: defaultCover,
      });
    });

    return novels;
  }

  // ================================
  // Search novels (real endpoint)
  // ================================
  async searchNovels(
    searchTerm: string,
    _pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const url =
      this.novelDomain + '/en/search?keyword=' + encodeURIComponent(searchTerm);

    const res = await fetchApi(url);
    const body = await res.text();
    const $ = loadCheerio(body);

    const novels: Plugin.NovelItem[] = [];

    $('.story-card a').each((_, el) => {
      const a = $(el);
      const href = a.attr('href');
      if (!href || !href.includes('/story/')) return;

      const name = a.find('h3, .title').text().trim() || a.text().trim();

      if (!name) return;

      novels.push({
        name,
        path: href,
        cover: defaultCover,
      });
    });

    return novels;
  }

  // ================================
  // Parse novel (paste full URL)
  // ================================
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    if (novelPath.startsWith('http')) {
      novelPath = novelPath.replace(this.novelDomain, '');
    }

    if (!novelPath.endsWith('/chapters/')) {
      novelPath = novelPath.replace(/\/?$/, '/') + 'chapters/';
    }

    const res = await fetchApi(this.novelDomain + novelPath);
    const body = await res.text();
    const $ = loadCheerio(body);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('h1').first().text().trim(),
      author: '',
      artist: '',
      cover: defaultCover,
      status: 'Unknown',
      summary: '',
      genres: '',
      chapters: [],
    };

    $('.chapter-list a').each((_, el) => {
      const a = $(el);
      const title = a.text().trim();
      const href = a.attr('href');
      if (!href) return;

      novel.chapters.push({
        name: title,
        path: href,
        releaseTime: '',
      });
    });

    if (novel.chapters.length === 0) {
      throw new Error('No chapters found on LumoStories page');
    }

    return novel;
  }

  // ================================
  // Parse chapter
  // ================================
  async parseChapter(chapterPath: string): Promise<string> {
    const res = await fetchApi(this.novelDomain + chapterPath);
    const body = await res.text();
    const $ = loadCheerio(body);

    const title =
      $('.chapter-content h2').text().trim() ||
      $('h1').first().text().trim() ||
      'Chapter';

    let content = '';
    $('.chapter-content p').each((_, el) => {
      content += `<p>${$(el).html()}</p>`;
    });

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

export default new LumoStories();
