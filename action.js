import core from '@actions/core';
import dayjs from 'dayjs';
import fetch from 'node-fetch';
import github from '@actions/github';
import { parse } from 'rss-to-json';

const { info, debug, setFailed } = core;
const { event } = github;

const validate = () => {
  if (
    !event?.inputs?.rss ||
    !event?.inputs?.rss?.length ||
    event?.inputs?.rss?.some(feed => !feed?.startsWith('http'))
  ) {
    throw new Error('No feed or invalid feed specified');
  }

  if (!event?.inputs?.slack_webhook || !event?.inputs?.slack_webhook?.startsWith('https')) {
    throw new Error('No Slack webhook or invalid webhook specified');
  }

  if (!event?.inputs?.interval || parseInt(event?.inputs?.interval).toString() !== 'NaN') {
    throw new Error('No interval or invalid interval specified');
  }
};

const getFeedImg = (rss, rssFeed) => {
  if (rss?.feed?.image) {
    return rss.feed.image;
  } else {
    const url = new URL(rssFeed);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&size=32`;
  }
};

const run = async () => {
  try {
    core.debug(`Validating inputs`);
    validate();

    const rssFeeds = event?.inputs?.rss;
    const slackWebhook = event?.inputs?.slack_webhook;
    const interval = parseInt(event?.inputs?.interval);
    const unfurl = event?.inputs?.unfurl;

    core.debug(`Processing ${rssFeeds.length} feeds`);
    for (const rssFeed in rssFeeds) {
      core.debug(`Retrieving ${event.inputs.rss}`);
      const rss = await parse(rssFeed);

      core.debug('Checking for feed items');
      if (rss?.items?.length) {
        core.debug(`Selecting items posted in the last ${interval} minutes`);
        const toSend = rss.items.filter(item => dayjs(item.published).isAfter(dayjs().subtract(interval, 'minute')));

        core.debug(`Sending ${toSend.length} item(s)`);
        const payload = {
          as_user: false,
          username: rss.title || 'FeedBot',
          icon_url: getFeedImg(rss, rssFeed),
          unfurl_links: unfurl,
          unfurl_media: unfurl,
          blocks: toSend.forEach(item => {
            const date = dayjs(item.published).format('MMM D @ h:mma Z');
            let text = '';
            if (unfurl) {
              text = `<${item.link}|${item.title}> · ${date}`;
            } else {
              if (item.title) text += `*${item.title}* · ${date}\n`;
              if (item.description) text += `${item.description}\n`;
              if (item.link) text += `<${item.link}|Read more>`;
            }

            return {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text
              }
            };
          })
        };

        fetch(slackWebhook, {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json'
          }
        });
      } else {
        throw new Error('No feed items found');
      }
    }
  } catch (err) {
    core.debug('Operation failed due to error');
    setFailed(err.message);
    process.exit(1);
  }
};