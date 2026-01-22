import { load as loadCheerio } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
// import { Plugin } from '@typings/plugin';
import { defaultCover } from '@libs/defaultCover';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';

class Nocturne implements Plugin.PluginBase {
  id = 'noc.syosetu';
  name = 'Syosetu18 (Nocturne)';
  icon = 'src/jp/syosetu18/icon.png';
  site = 'https://noc.syosetu.com';
  // novel domain where the adult content lives
  novelDomain = 'https://novel18.syosetu.com';
  version = '1.2.2';
  headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  // stored cookie string (e.g. "name=value; other=val")
  private ageCookie?: string;

  // Centralized fetch wrapper that ensures age-gate cookie is set (best-effort)
  private async fetchWithAgeGate(input: string, options: RequestInit = {}) {
    await this.ensureAgeGatePassed(input);

    const mergedHeaders: Record<string, string> = {
      ...(options.headers || {}),
      ...this.headers,
    } as Record<string, string>;

    if (this.ageCookie) {
      mergedHeaders.Cookie = mergedHeaders.Cookie
        ? `${mergedHeaders.Cookie}; ${this.ageCookie}`
        : this.ageCookie;
    }

    return fetchApi(input, { ...options, headers: mergedHeaders });
  }

  // Best-effort age gate handler:
  // - probes the URL for age-check markers,
  // - follows an ageauth redirect if present,
  // - or submits a discovered form, and captures Set-Cookie headers if available.
  private async ensureAgeGatePassed(url: string) {
    if (this.ageCookie) return;

    try {
      const probe = await fetchApi(url, { headers: this.headers });
      const body = await probe.text();
      const finalUrl = (probe as any).url || url;

      const looksLikeAgePage =
        /年齢確認|18歳以上|年齢を確認/.test(body) ||
        /ageauth|age_confirm|agecheck/.test(finalUrl);
      if (!looksLikeAgePage) return;

      // try to find ageauth redirect link
      const redirectMatch = body.match(
        /https?:\/\/[^"'<>\s]*ageauth[^"'<>\s]*/i,
      );
      const redirectUrl = redirectMatch ? redirectMatch[0] : null;

      if (redirectUrl) {
        const redirectRes = await fetchApi(redirectUrl, {
          headers: this.headers,
        });
        const hdrsAny: any = (redirectRes as any).headers;
        let setCookieRaw: string | undefined;

        try {
          if (hdrsAny && typeof hdrsAny.raw === 'function') {
            const raw = hdrsAny.raw();
            if (raw && raw['set-cookie'] && raw['set-cookie'].length) {
              setCookieRaw = raw['set-cookie']
                .map((c: string) => c.split(';')[0])
                .join('; ');
            }
          }
        } catch (e) {}

        try {
          if (!setCookieRaw && hdrsAny && typeof hdrsAny.get === 'function') {
            const sc = hdrsAny.get('set-cookie');
            if (sc)
              setCookieRaw = Array.isArray(sc)
                ? sc.map(s => s.split(';')[0]).join('; ')
                : sc.split(';')[0];
          }
        } catch (e) {}

        if (setCookieRaw) {
          this.ageCookie = setCookieRaw;
          return;
        }
      }

      // If no redirect, try to find and submit a form (best-effort)
      const formMatch = body.match(/<form[^>]*>([\s\S]*?)<\/form>/i);
      if (formMatch) {
        const formHtml = formMatch[0];
        const actionMatch = formHtml.match(/action=["']([^"']+)["']/i);
        const action = actionMatch ? actionMatch[1] : finalUrl;

        const inputs: Record<string, string> = {};
        const inputRegex =
          /<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi;
        let iMatch: RegExpExecArray | null;
        while ((iMatch = inputRegex.exec(formHtml))) {
          inputs[iMatch[1]] = iMatch[2] || '';
        }

        try {
          const target = action.startsWith('http')
            ? action
            : new URL(action, finalUrl).href;
          const formBody = new URLSearchParams(inputs).toString();
          const res = await fetchApi(target, {
            method: 'POST',
            headers: {
              ...this.headers,
              'Content-Type': 'application/x-www-form-urlencoded',
              Referer: finalUrl,
            },
            body: formBody,
          });

          const hdrsAny2: any = (res as any).headers;
          let sc2: string | undefined;
          try {
            if (hdrsAny2 && typeof hdrsAny2.raw === 'function') {
              const raw2 = hdrsAny2.raw();
              if (raw2 && raw2['set-cookie'] && raw2['set-cookie'].length)
                sc2 = raw2['set-cookie']
                  .map((c: string) => c.split(';')[0])
                  .join('; ');
            }
          } catch (e) {}
          try {
            if (!sc2 && hdrsAny2 && typeof hdrsAny2.get === 'function') {
              const g = hdrsAny2.get('set-cookie');
              if (g)
                sc2 = Array.isArray(g)
                  ? g.map(s => s.split(';')[0]).join('; ')
                  : g.split(';')[0];
            }
          } catch (e) {}

          if (sc2) {
            this.ageCookie = sc2;
            return;
          }
        } catch (e) {
          // ignore form submit failures
        }
      }

      // Fallback: request novelDomain root (it may set cookie headers)
      try {
        const rootRes = await fetchApi(this.novelDomain, {
          headers: this.headers,
        });
        const hdrsAny3: any = (rootRes as any).headers;
        if (hdrsAny3 && typeof hdrsAny3.get === 'function') {
          const sc3 = hdrsAny3.get('set-cookie');
          if (sc3)
            this.ageCookie = Array.isArray(sc3)
              ? sc3.map(s => s.split(';')[0]).join('; ')
              : sc3.split(';')[0];
        }
      } catch (e) {}
    } catch (e) {
      // probe failed — continue without cookie
    }
  }

  // noc search path (differs from yomou)
  searchUrl = (pagenum?: number, order?: string) => {
    return `${this.site}/search/search/search.php?order=${order || 'hyoka'}${
      pagenum !== undefined
        ? `&p=${pagenum <= 1 || pagenum > 100 ? '1' : pagenum}`
        : ''
    }`;
  };

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const getNovelsFromPage = async (pagenumber: number) => {
      let url = this.site;

      if (!filters.genre.value) {
        url += `/rank/list/type/${filters.ranking.value}_${filters.modifier.value}/?p=${pagenumber}`;
      } else {
        url += `/rank/${filters.genre.value.length === 1 ? 'isekailist' : 'genrelist'}/type/${filters.ranking.value}_${filters.genre.value}${
          filters.modifier.value === 'total' ? '' : `_${filters.modifier.value}`
        }/?p=${pagenumber}`;
      }

      const html = await (await this.fetchWithAgeGate(url)).text();
      const $ = loadCheerio(html, { decodeEntities: false });

      if (parseInt($('.is-current').text() || '1') !== pagenumber) return [];

      const novels: Plugin.NovelItem[] = [];
      $('.c-card, .p-ranklist-item').each((_, e) => {
        const anchor = loadCheerio(e)
          .find('.p-ranklist-item__title a, a')
          .first();
        const href = anchor.attr('href');
        if (!href) return;
        const name =
          anchor.text().trim() || loadCheerio(e).find('.title').text().trim();
        novels.push({
          path: href.replace(this.novelDomain, ''),
          name,
          cover: defaultCover,
        });
      });

      return novels;
    };

    return await getNovelsFromPage(pageNo);
  }

  private async parseChaptersFromPage(
    loadedCheerio: cheerio.CheerioAPI,
  ): Promise<Plugin.ChapterItem[]> {
    const chapters: Plugin.ChapterItem[] = [];

    loadedCheerio('.p-eplist__sublist, .episode_list, .chapter-list').each(
      (_, element) => {
        const a = loadedCheerio(element).find('a').first();
        const chapterUrl = a.attr('href');
        const chapterName = a.text().trim();
        const releaseDate =
          loadedCheerio(element)
            .find('.p-eplist__update')
            .text()
            .trim()
            .split(' ')[0]
            .replace(/\//g, '-') ||
          loadedCheerio(element)
            .find('.date')
            .text()
            .trim()
            .split(' ')[0]
            .replace(/\//g, '-');

        if (chapterUrl) {
          chapters.push({
            name: chapterName,
            releaseTime: releaseDate,
            path: chapterUrl.replace(this.novelDomain, ''),
          });
        }
      },
    );

    return chapters;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const result = await this.fetchWithAgeGate(this.novelDomain + novelPath);
    const body = await result.text();
    const $ = loadCheerio(body, { decodeEntities: false });

    let status = 'Unknown';
    const announce = $('.c-announce').text();
    if (announce.includes('連載中') || announce.includes('未完結'))
      status = NovelStatus.Ongoing;
    else if (announce.includes('更新されていません'))
      status = NovelStatus.OnHiatus;
    else if (announce.includes('完結')) status = NovelStatus.Completed;

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('.p-novel__title').text().trim(),
      author: $('.p-novel__author').text().replace('作者：', '').trim(),
      status,
      artist: '',
      cover: defaultCover,
      chapters: [],
      genres: $('meta[property="og:description"]')
        .attr('content')
        ?.split(' ')
        .join(','),
    };

    novel.summary = $('#novel_ex').html() || '';

    const chapters: Plugin.ChapterItem[] = [];

    const lastPageLink =
      $('.c-pager__item--last').attr('href') || $('.last').attr('href');

    if (!lastPageLink) {
      chapters.push(...(await this.parseChaptersFromPage($)));
    } else {
      const lastPageMatch = lastPageLink.match(/\?p=(\d+)/);
      const totalPages = lastPageMatch ? parseInt(lastPageMatch[1]) : 1;

      const pagePromises = Array.from({ length: totalPages }, (_, i) =>
        this.fetchWithAgeGate(
          `${this.novelDomain}${novelPath}?p=${i + 1}`,
        ).then(r => r.text()),
      );

      const pageResults = await Promise.all(pagePromises);
      for (const pageBody of pageResults) {
        const pageCheerio = loadCheerio(pageBody, { decodeEntities: false });
        chapters.push(
          ...(await this.parseChaptersFromPage(pageCheerio as any)),
        );
      }
    }

    // Fallback for single-page novels (no chapter list at all)
    // If the novel page itself contains body text, synthesize a Chapter 1.
    if (chapters.length === 0) {
      const hasBody =
        $('.p-novel__body .p-novel__text').length > 0 ||
        $('#novel_honbun').length > 0;

      if (hasBody) {
        chapters.push({
          name: 'Chapter 1',
          releaseTime: '',
          // IMPORTANT: point to the novel page itself
          path: novelPath,
        });
      }
    }

    novel.chapters = chapters;
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const result = await this.fetchWithAgeGate(this.novelDomain + chapterPath);
    const body = await result.text();
    const $ = loadCheerio(body, { decodeEntities: false });

    const chapterTitle =
      $('.p-novel__subtitle').html() ||
      $('.p-novel__title').html() ||
      'Chapter 1';

    const chapterContent =
      $('.p-novel__body .p-novel__text').html() ||
      $('#novel_honbun').html() ||
      '';

    if (!chapterContent) {
      throw new Error('Failed to parse chapter content');
    }

    return `<h1>${chapterTitle}</h1>${chapterContent}`;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const getNovelsFromPage = async (pagenumber: number) => {
      const url =
        this.searchUrl(pagenumber) + `&word=${encodeURIComponent(searchTerm)}`;
      const res = await this.fetchWithAgeGate(url);
      const body = await res.text();
      const $ = loadCheerio(body, { decodeEntities: false });

      const pageNovels: Plugin.NovelItem[] = [];
      $('.searchkekka_box, .search-result, .novel_h').each((i, e) => {
        const novelDIV =
          $(e).find('.novel_h').first() || $(e).find('.title').first();
        const novelA = novelDIV.children().first();
        const href =
          (novelA && novelA.attr && novelA.attr('href')) ||
          novelDIV.attr('href');
        if (!href) return;
        const novelPath = href.replace(this.novelDomain, '');
        pageNovels.push({
          name: novelDIV.text().trim() || $(e).find('a').first().text().trim(),
          path: novelPath,
          cover: defaultCover,
        });
      });

      return pageNovels;
    };

    return await getNovelsFromPage(pageNo);
  }

  resolveUrl(path: string): string {
    return this.novelDomain + path;
  }

  filters = {
    ranking: {
      type: FilterTypes.Picker,
      label: 'Ranked by',
      options: [
        { label: '日間', value: 'daily' },
        { label: '週間', value: 'weekly' },
        { label: '月間', value: 'monthly' },
        { label: '四半期', value: 'quarter' },
        { label: '年間', value: 'yearly' },
        { label: '累計', value: 'total' },
      ],
      value: 'total',
    },
    genre: {
      type: FilterTypes.Picker,
      label: 'Ranking Genre',
      options: [
        { label: '総ジャンル', value: '' },
        { label: '異世界転生/転移〔恋愛〕〕', value: '1' },
        { label: '異世界転生/転移〔ファンタジー〕', value: '2' },
        { label: '異世界転生/転移〔文芸・SF・その他〕', value: 'o' },
        { label: '異世界〔恋愛〕', value: '101' },
        { label: '現実世界〔恋愛〕', value: '102' },
        { label: 'ハイファンタジー〔ファンタジー〕', value: '201' },
        { label: 'ローファンタジー〔ファンタジー〕', value: '202' },
        { label: '純文学〔文芸〕', value: '301' },
        { label: 'ヒューマンドラマ〔文芸〕', value: '302' },
        { label: '歴史〔文芸〕', value: '303' },
        { label: '推理〔文芸〕', value: '304' },
        { label: 'ホラー〔文芸〕', value: '305' },
        { label: 'アクション〔文芸〕', value: '306' },
        { label: 'コメディー〔文芸〕', value: '307' },
        { label: 'VRゲーム〔SF〕', value: '401' },
        { label: '宇宙〔SF〕', value: '402' },
        { label: '空想科学〔SF〕', value: '403' },
        { label: 'パニック〔SF〕', value: '404' },
        { label: '童話〔その他〕', value: '9901' },
        { label: '詩〔その他〕', value: '9902' },
        { label: 'エッセイ〔その他〕', value: '9903' },
        { label: 'その他〔その他〕', value: '9999' },
      ],
      value: '',
    },
    modifier: {
      type: FilterTypes.Picker,
      label: 'Modifier',
      options: [
        { label: 'すべて', value: 'total' },
        { label: '連載中', value: 'r' },
        { label: '完結済', value: 'er' },
        { label: '短編', value: 't' },
      ],
      value: 'total',
    },
  } satisfies Filters;
}

export default new Nocturne();
