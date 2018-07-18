// @remove-file-on-eject
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
  throw err;
});

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const execSync = require('child_process').execSync;
const spawn = require('react-dev-utils/crossSpawn');
const { defaultBrowsers } = require('react-dev-utils/browsersHelper');
const os = require('os');
const makeDotEnvFile = require('./utils/createDotEnv').makeDotEnvFile;

function isInGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function isInMercurialRepository() {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function tryGitInit(appPath) {
  let didInit = false;
  try {
    execSync('git --version', { stdio: 'ignore' });
    if (isInGitRepository() || isInMercurialRepository()) {
      return false;
    }

    execSync('git init', { stdio: 'ignore' });
    didInit = true;

    execSync('git add -A', { stdio: 'ignore' });
    execSync('git commit -m "Initial commit from Create React App"', {
      stdio: 'ignore',
    });
    return true;
  } catch (e) {
    if (didInit) {
      // If we successfully initialized but couldn't commit,
      // maybe the commit author config is not set.
      // In the future, we might supply our own committer
      // like Ember CLI does, but for now, let's just
      // remove the Git files to avoid a half-done state.
      try {
        // unlinkSync() doesn't work on directories.
        fs.removeSync(path.join(appPath, '.git'));
      } catch (removeErr) {
        // Ignore.
      }
    }
    return false;
  }
}

module.exports = function(
  appPath,
  appName,
  verbose,
  originalDirectory,
  template
) {
  require('inquirer').prompt([{
    type: 'list', name: 'type', message: 'Choose your develop language:',
    default: 'javascript', choices: ['javascript', 'typescript']
  }])
  .then(answer => {
    const languageType = answer.type;
    const ownPackageName = require(path.join(__dirname, '..', 'package.json'))
      .name;
    const ownPath = path.join(appPath, 'node_modules', ownPackageName);
    const appPackage = require(path.join(appPath, 'package.json'));
    const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

    // Copy over some of the devDependencies
    appPackage.dependencies = appPackage.dependencies || {};

    // Setup the script rules
    // 用 env 传值避免各种 require 文件还要传
    appPackage.scripts = {
      start: 'byted-react-scripts start',
      build: 'byted-react-scripts build',
      test: 'byted-react-scripts test --env=jsdom',
      eject: 'byted-react-scripts eject',
    };

    appPackage.browserslist = defaultBrowsers;

    fs.writeFileSync(
      path.join(appPath, 'package.json'),
      JSON.stringify(appPackage, null, 2) + os.EOL
    );

    const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
    if (readmeExists) {
      fs.renameSync(
        path.join(appPath, 'README.md'),
        path.join(appPath, 'README.old.md')
      );
    }

    // Copy the files for the user
    const templatePath = template
      ? path.resolve(originalDirectory, template)
      : path.join(ownPath, 'template');
    if (fs.existsSync(templatePath)) {
      fs.copySync(templatePath, appPath);
      const jsTplPath = path.resolve(appPath, '_js');
      const tsTplPath = path.resolve(appPath, '_ts');
      if (languageType === 'javascript') {
        fs.copySync(jsTplPath, appPath);
      } else {
        fs.copySync(tsTplPath, appPath);
      }
      fs.removeSync(tsTplPath);
      fs.removeSync(jsTplPath);
      makeDotEnvFile(appPath, languageType);
    } else {
      console.error(
        `Could not locate supplied template: ${chalk.green(templatePath)}`
      );
      return;
    }

    // Rename gitignore after the fact to prevent npm from renaming it to .npmignore
    // See: https://github.com/npm/npm/issues/1862
    ['gitignore', 'eslintrc.json'].forEach(filename => {
      const fullFilename = path.join(appPath, filename);
      const fullDotFilename = path.join(appPath, `.${filename}`);
      try {
        if (!fs.existsSync(fullFilename)) {
          return;
        }
        fs.moveSync(
          fullFilename,
          fullDotFilename,
          []
        );
      } catch (err) {
        // Append if there's already a `.gitignore` file there
        if (err.code === 'EEXIST') {
          const data = fs.readFileSync(path.join(appPath, filename));
          fs.appendFileSync(path.join(appPath, `.${filename}`), data);
          fs.unlinkSync(path.join(appPath, filename));
        } else {
          throw err;
        }
      }
    });

    let command;
    let args;

    if (useYarn) {
      command = 'yarnpkg';
      args = ['add'];
    } else {
      command = 'npm';
      args = ['install', '--save', verbose && '--verbose'].filter(e => e);
    }

    const devDeps = [];
    const deps = ['react', 'react-dom'];
    if (languageType === 'typescript') {
      // Install dev dependencies
      devDeps.push(
        '@types/node',
        '@types/react',
        '@types/react-dom',
        '@types/jest',
        'tslint'
      );
    } else {
      devDeps.push('eslint-config-byted');
    }

    console.log(
      `Installing ${devDeps.join(', ')} as dev dependencies ${command}...`
    );
    console.log();

    const devProc = spawn.sync(command, args.concat('-D').concat(devDeps), {
      stdio: 'inherit',
    });
    if (devProc.status !== 0) {
      console.error(`\`${command} ${args.concat(devDeps).join(' ')}\` failed`);
      return;
    }

    // Install additional template dependencies, if present
    const templateDependenciesPath = path.join(
      appPath,
      '.template.dependencies.json'
    );
    if (fs.existsSync(templateDependenciesPath)) {
      const templateDependencies = require(templateDependenciesPath).dependencies;
      args = args.concat(
        Object.keys(templateDependencies).map(key => {
          return `${key}@${templateDependencies[key]}`;
        })
      );
      fs.unlinkSync(templateDependenciesPath);
    }

    // Install react and react-dom for backward compatibility with old CRA cli
    // which doesn't install react and react-dom along with react-scripts
    // or template is presetend (via --internal-testing-template)
    if (!isReactInstalled(appPackage) || template) {
      console.log(`Installing react and react-dom using ${command}...`);
      console.log();

      const proc = spawn.sync(command, args.concat(deps), { stdio: 'inherit' });
      if (proc.status !== 0) {
        console.error(`\`${command} ${args.concat(deps).join(' ')}\` failed`);
        return;
      }
    }

    if (tryGitInit(appPath)) {
      console.log();
      console.log('Initialized a git repository.');
    }

    // Display the most elegant way to cd.
    // This needs to handle an undefined originalDirectory for
    // backward compatibility with old global-cli's.
    let cdpath;
    if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
      cdpath = appName;
    } else {
      cdpath = appPath;
    }

    // Change displayed command to yarn instead of yarnpkg
    const displayedCommand = useYarn ? 'yarn' : 'npm';

    console.log();
    console.log(`Success! Created ${appName} at ${appPath}`);
    console.log('Inside that directory, you can run several commands:');
    console.log();
    console.log(chalk.cyan(`  ${displayedCommand} start`));
    console.log('    Starts the development server.');
    console.log();
    console.log(
      chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}build`)
    );
    console.log('    Bundles the app into static files for production.');
    console.log();
    console.log(chalk.cyan(`  ${displayedCommand} test`));
    console.log('    Starts the test runner.');
    console.log();
    console.log(
      chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}eject`)
    );
    console.log(
      '    Removes this tool and copies build dependencies, configuration files'
    );
    console.log(
      '    and scripts into the app directory. If you do this, you can’t go back!'
    );
    console.log();
    console.log('We suggest that you begin by typing:');
    console.log();
    console.log(chalk.cyan('  cd'), cdpath);
    console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
    if (readmeExists) {
      console.log();
      console.log(
        chalk.yellow(
          'You had a `README.md` file, we renamed it to `README.old.md`'
        )
      );
    }
    console.log();
    console.log('Happy hacking!');
  });
};

function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};

  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}
