import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { defaultCover } from '@libs/defaultCover';

class PixivSeriesInput implements Plugin.PluginBase {
  id = 'pixiv.series.input';
  name = 'Pixiv Novels';
  icon = 'src/jp/pixiv/icon.png';
  site = 'https://www.pixiv.net';
  version = '1.1.0';

  headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

    // 🔴 REQUIRED (copy from browser DevTools)
    // PHPSESSID=xxxx; device_token=yyyy; privacy_policy_agreement=1
    Cookie: [
      'PHPSESSID=',
      'device_token=',
      'privacy_policy_agreement=',
      'p_ab_id=',
      'p_ab_id_2=',
      'p_ab_d_id=',
    ].join('; '),
  };

  /* =========================
     Required stubs
     ========================= */

  async popularNovels(): Promise<Plugin.NovelItem[]> {
    return [];
  }

  async searchNovels(): Promise<Plugin.NovelItem[]> {
    return [];
  }

  /* =========================
     Helpers
     ========================= */

  private extractNextData(html: string): any {
    const m = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!m) {
      throw new Error(
        'Pixiv blocked request (missing __NEXT_DATA__). Check cookie.',
      );
    }
    return JSON.parse(m[1]);
  }

  /* =========================
     Entry point
     ========================= */

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    if (novelPath.includes('/novel/show.php')) {
      return this.parseSingleNovel(novelPath);
    }
    if (novelPath.includes('/novel/series/')) {
      return this.parseSeries(novelPath);
    }

    throw new Error('Unsupported Pixiv URL');
  }

  /* =========================
     Series
     ========================= */

  private async parseSeries(path: string): Promise<Plugin.SourceNovel> {
    const res = await fetchApi(this.site + path, {
      headers: this.headers,
    });
    const html = await res.text();

    const next = this.extractNextData(html);
    const props = next?.props?.pageProps;

    if (!props?.series || !props?.seriesContents) {
      throw new Error('Failed to load Pixiv series (cookie issue)');
    }

    const chapters: Plugin.ChapterItem[] = props.seriesContents.map(
      (n: any) => ({
        name: n.title,
        path: `/novel/show.php?id=${n.id}`,
        releaseTime: '',
      }),
    );

    return {
      path,
      name: props.series.title,
      author: props.series.userName,
      artist: '',
      cover: props.series.coverUrl || defaultCover,
      summary: props.series.description || '',
      genres: '',
      status: '',
      chapters,
    };
  }

  /* =========================
     Single novel → 1 chapter
     ========================= */

  private async parseSingleNovel(path: string): Promise<Plugin.SourceNovel> {
    const res = await fetchApi(this.site + path, {
      headers: this.headers,
    });
    const html = await res.text();

    const next = this.extractNextData(html);
    const novel = next?.props?.pageProps?.novel;

    if (!novel) {
      throw new Error('Failed to load Pixiv novel (cookie issue)');
    }

    return {
      path,
      name: novel.title,
      author: novel.userName,
      artist: '',
      cover: novel.coverUrl || defaultCover,
      summary: novel.description || '',
      genres: '',
      status: '',
      chapters: [
        {
          name: novel.title,
          path,
          releaseTime: '',
        },
      ],
    };
  }

  /* =========================
     Chapter reader
     ========================= */

  async parseChapter(chapterPath: string): Promise<string> {
    const res = await fetchApi(this.site + chapterPath, {
      headers: this.headers,
    });
    const html = await res.text();

    const next = this.extractNextData(html);
    const novel = next?.props?.pageProps?.novel;

    if (!novel?.text) {
      throw new Error('Failed to load Pixiv chapter text');
    }

    const body = novel.text
      .split('\n')
      .map((p: string) => `<p>${p}</p>`)
      .join('');

    return `<h1>${novel.title}</h1>${body}`;
  }

  resolveUrl(path: string): string {
    return this.site + path;
  }

  filters = {};
}

export default new PixivSeriesInput();
