import * as core from '@actions/core';

import {
  IncomingWebhook
} from '@slack/webhook';

export async function notifySlack(message: string) {
  const url = core.getInput('slack-webhook');
  if (url) {
    core.info('Notifying Slack.');
    const webhook = new IncomingWebhook(url);
    await webhook.send({
      text: message
    });
  } else {
    core.info('No webhook available for Slack notification.');
  }

}
