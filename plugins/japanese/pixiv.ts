import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

class PixivNovelSeries implements Plugin.PluginBase {
  id = 'pixiv.novel';
  name = 'Pixiv Novel Series';
  icon = 'src/jp/pixiv/icon.png';
  site = 'https://www.pixiv.net';
  version = '1.0.0';

  headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // REQUIRED
    // Copy from browser DevTools → Application → Cookies
    Cookie: 'PHPSESSID=YOUR_SESSION_HERE;',
  };

  // -------- Utils --------

  private extractNextData(html: string): any {
    const match = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!match) throw new Error('Pixiv __NEXT_DATA__ not found');
    return JSON.parse(match[1]);
  }

  // -------- Series → Novel --------

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const res = await fetchApi(this.site + novelPath, {
      headers: this.headers,
    });
    const html = await res.text();

    const next = this.extractNextData(html);
    const state = next.props.pageProps;

    const series = state.series;
    const novels = state.seriesContents;

    const chapters: Plugin.ChapterItem[] = novels.map((n: any) => ({
      name: n.title,
      path: `/novel/show.php?id=${n.id}`,
      releaseTime: '',
    }));

    return {
      path: novelPath,
      name: series.title,
      author: series.userName,
      artist: '',
      cover: series.coverUrl || defaultCover,
      summary: series.description || '',
      genres: '',
      status: '',
      chapters,
    };
  }

  // -------- Chapter → Content --------

  async parseChapter(chapterPath: string): Promise<string> {
    const res = await fetchApi(this.site + chapterPath, {
      headers: this.headers,
    });
    const html = await res.text();

    const next = this.extractNextData(html);
    const novel = next.props.pageProps.novel;

    const title = novel.title;
    const body = novel.text
      .split('\n')
      .map((p: string) => `<p>${p}</p>`)
      .join('');

    return `<h1>${title}</h1>${body}`;
  }

  // -------- Unsupported --------

  async searchNovels() {
    return [];
  }

  async popularNovels() {
    return [];
  }

  resolveUrl(path: string): string {
    return this.site + path;
  }

  filters = {};
}

export default new PixivNovelSeries();
