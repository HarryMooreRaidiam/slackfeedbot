import core from '@actions/core';
import dayjs from 'dayjs';
import { parse } from 'rss-to-json';
import { RssFeed, RssFeedItem } from '../types.d';
import { checkCache, readCache } from './cache';

// Gets the feed, checks the cache (or time since last run), and returns new items
const getFeed = async (
  rssFeed: string,
  cacheDir: string | undefined,
  interval: number | undefined,
  title_filter_include: string,
  title_filter_exclude: string
): Promise<{ filtered: RssFeedItem[]; unfiltered: RssFeed; cached: string[] }> => {
  core.debug(`Retrieving ${rssFeed}…`);

  var rss: RssFeed = await parse(rssFeed, {});
  core.debug(`Feed has ${rss?.items?.length} items`);

  rss.items = filterFeed(rss.items ?? [], title_filter_include.split(','), title_filter_exclude.split(','));

  if (rss?.items?.length) {
    let toSend: RssFeedItem[] = [];
    let cached: string[] = [];

    if (cacheDir) {
      core.debug(`Retrieving previously cached entries…`);

      try {
        cached = await readCache(rssFeed, cacheDir);
        toSend = (await checkCache(rss, cached)).filter(item => {
          return dayjs(item.created).isAfter(dayjs().subtract(1, 'hour'));
        });
      } catch (err) {
        core.debug((<Error>err).message);

        toSend = rss.items.filter(item => {
          return dayjs(item.created).isAfter(dayjs().subtract(1, 'hour'));
        });
      }
    } else if (interval) {
      core.debug(`Selecting items posted in the last ${interval} minutes…`);

      toSend = rss.items.filter(item => {
        return dayjs(item.created).isAfter(dayjs().subtract(interval, 'minute'));
      });
    }

    return { filtered: toSend, unfiltered: rss, cached: cached };
  } else {
    throw new Error('No feed items found');
  }
};

export { getFeed };

// Filters the feed items by title if a filter is provided
const filterFeed = (filtered: RssFeedItem[], title_filter_include: string[], title_filter_exclude: string[]): RssFeedItem[] => {
  if (title_filter_include.length === 0 && title_filter_exclude.length === 0) {
    return filtered;
  }

  return filtered.filter(
    item => { 
      return (title_filter_include.length === 0 || title_filter_include.some(filter => item.title?.includes(filter))) && (title_filter_exclude.length === 0 || !title_filter_exclude.some(filter => item.title?.includes(filter))) 
    });
};