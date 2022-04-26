import { registerDataPlugin } from '@builder.io/data-plugin-tools';
import pkg from '../package.json';
import { createDeliveryClient } from '@kentico/kontent-delivery';
import { system } from '../../../packages/plugin-loader/src/plugin-loader';
import { pushd } from 'shelljs';

// https://localhost:1268/plugin.system.js?pluginId=@builder.io/plugin-kontent

const pluginId = pkg.name;

registerDataPlugin(
  {
    id: pluginId,
    name: 'Kontent',
    icon: 'https://raw.githubusercontent.com/Kentico/Home/master/images/kk-logo-shortcut.png',
    // Settings is optional and it represents what input you need from the user to connect their data
    settings: [
      // Example of a settings input
      {
        name: 'projectId',
        type: 'string',
        required: true,
        helperText:
          'Get your project ID'
      },
    ],
    ctaText: ``,
  },
  // settings will be an Observable map of the settings configured above
  async settings => {
    const projectId = settings.get('projectId')?.trim();

    const client = createDeliveryClient({
      projectId
    });

    return {
      async getResourceTypes() {
        console.log('getResourceTypes');

        const languagesResponse = await client.languages().toAllPromise();
        const languagesEnum = languagesResponse.data.items
          .map(language => ({
            value: language.system.codename,
            label: language.system.name
          }))
          // Ask about this
          .concat([
            {
              label: 'Dynamic (bound to state)',
              value: '{{state.locale || ""}}',
            },
          ]);

        const result = await client.types().toAllPromise();
        return result.data.items.map(type => ({
          name: type.system.name,
          id: type.system.codename,
          canPickEntries: true,
          entryInputs: () => {
            console.log('entryInputs', type);
            return [
              {
                name: 'language',
                type: 'text',
                enum: languagesEnum,

              },
            ];
          },
          inputs: () => {
            console.log('inputs', type);
            const acceptableElements = type.elements.filter(element =>
              // extend to all types - ask about possibilities
              ['text',/* 'number', 'date', 'custom_element'*/].includes(element.type));
            // return a list of inputs to query your data, think of this as the query schema: limit / offset / specific fields to query against
            const fields = [
              {
                name: 'limit',
                defaultValue: 10,
                min: 0,
                max: 100,
                type: 'number',
              },
              {
                name: 'language',
                type: 'text',
                enum: languagesEnum,
              }
            ];

            if (acceptableElements.length > 0) {
              fields.push({
                name: 'elements',
                advanced: true,
                type: 'object',
                friendlyName: `${type.system.name} elements`,
                subFields: acceptableElements.map(element => ({
                  type: element.type,
                  name: element.id,
                  friendlyName: element.name
                })),
                // ask about this
              } as any);
            }

            console.log('fields', fields);
            return fields;
          },
          toUrl: (options: any) => {
            console.log('toUrl', options);

            // by entry
            if (options.entry) {
              const url = client.item(options.entry).getUrl();
              return url;
            }
            // by query, read query values from the schema you defined in inputs above and generate a public url to the results
            const query = client.items()
              .type(type.system.codename);

            if (options.language) {
              query.languageParameter(options.language);
            }

            if (options.limit) {
              query.limitParameter(options.limit);
            }

            return query.getUrl();
          },
        }));
      },
      async getEntriesByResourceType(id: string, options) {
        console.log('getEntriesByResourceType', 'options: ', options, 'id: ', id);
        const query = client.items().type(id);
        const result = await query.toAllPromise();
        if (options?.resourceEntryId) {
          // data plugins UI is asking for a specific entry return [entry]
          const entry = result.data.items.find(item => item.system.codename === options.resourceEntryId);
          if (entry) {
            return [{
              id: entry.system.codename,
              name: entry.system.name,
            }];
          }
        } else if (options?.searchText != undefined) {
          // data plugins UI is asking for the results of a free form search on entries per resource type
          // hit api with searchText and return an array that matches interface Array<{ name: string, id: string}>

          return result.data.items
            .filter(({ system: { name } }) =>
              name.toLowerCase()
                .includes((options?.searchText as string)?.toLowerCase())
            ).map(item => ({
              id: item.system.codename,
              name: item.system.name
            }));
        }
        // no search or specific entry , return all entries for  this specific resource type
        return result.data.items.map(entry => {
          return ({
            id: entry.system.codename,
            name: entry.system.name,
          });
        });
      },
    };
  }
);
