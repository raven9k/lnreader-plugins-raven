import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

class LumoStories implements Plugin.PluginBase {
  id = 'lumostories';
  name = 'Lumo Stories';
  version = '1.0.1';
  icon = 'src/en/lumo/icon.png';
  site = 'https://lumostories.com';
  novelDomain = 'https://lumostories.com';

  // LumoStories does not provide a public popular listing
  async popularNovels(_pageNo: number): Promise<Plugin.NovelItem[]> {
    return [];
  }

  // LumoStories has no usable search endpoint
  async searchNovels(
    _searchTerm: string,
    _pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return [];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
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

    // Chapter list order is authoritative (read/{id} is random)
    $('.chapter-list a').each((_, el) => {
      const a = $(el);
      const title = a.text().trim(); // e.g. "CHAPTER 358 - ..."
      const href = a.attr('href');
      if (!href) return;

      novel.chapters.push({
        name: title,
        path: href,
        releaseTime: '',
      });
    });

    return novel;
  }

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
    return this.novelDomain + path;
  }
}

export default new LumoStories();
