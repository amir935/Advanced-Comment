import * as React from "react";
import { Version } from "@microsoft/sp-core-library";

import { SPComponentLoader } from "@microsoft/sp-loader";
import { CalloutTriggers } from "@pnp/spfx-property-controls/lib/PropertyFieldHeader";
import { PropertyFieldSliderWithCallout } from "@pnp/spfx-property-controls/lib/PropertyFieldSliderWithCallout";
import { PropertyFieldToggleWithCallout } from "@pnp/spfx-property-controls/lib/PropertyFieldToggleWithCallout";
import {
  PropertyFieldListPicker,
  PropertyFieldListPickerOrderBy,
} from "@pnp/spfx-property-controls/lib/PropertyFieldListPicker";
import * as _ from "lodash";
import * as moment from "moment";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";
import {
  IPropertyPaneConfiguration,
  PropertyPaneTextField,
} from "@microsoft/sp-property-pane";
import styles from "./PageCommentsWebPart.module.scss";
import * as strings from "PageCommentsWebPartStrings";

// import * as $ from "jquery";
require("textcomplete");
import { sp } from "@pnp/sp";
import SPHelper from "./SPHelper";
require("./css/jquery-comments.css");
import * as $ from "jquery";

export interface IPageCommentsWebPartProps {
  enableNavigation: boolean;
  enableReplying: boolean;
  enableAttachments: boolean;
  enableEditing: boolean;
  enableUpvoting: boolean;
  enableDeleting: boolean;
  enableDeletingCommentWithReplies: boolean;
  enableHashtags: boolean;
  enablePinging: boolean;
  enableDocumentPreview: boolean;
  roundProfilePictures: boolean;
  datetimeFormat: string;
  attachmentFileFormats: string;
  attachmentFileSize: number;
  docLib: string;
}

export default class PageCommentsWebPart extends BaseClientSideWebPart<IPageCommentsWebPartProps> {
  private helper: SPHelper = null;
  private currentUserInfo: any = null;
  private siteUsers: any[] = [];
  private pageurl: string = "";
  private postAttachmentPath: string = "";
  private pageFolderExists: boolean = false;

  protected async onInit(): Promise<void> {
    await super.onInit();

    sp.setup({
      spfxContext: this.context as any,
    });
  }

  public constructor() {
    super();
    SPComponentLoader.loadCss(
      "https://maxcdn.bootstrapcdn.com/font-awesome/4.5.0/css/font-awesome.min.css"
    );
  }

  public render(): void {
    if (
      this.properties.enableAttachments &&
      (!this.properties.docLib ||
        this.properties.docLib.toLocaleUpperCase() === "NO_LIST_SELECTED")
    ) {
      this.domElement.innerHTML = `
        <div class="${styles.errorMessage}"><i class="fa fa-times-circle" aria-hidden="true"></i>&nbsp;${strings.NoAttachmentRepoMsg}</div>
      `;
    } else {
      this.context.statusRenderer.displayLoadingIndicator(
        this.domElement,
        strings.LoadingMsg,
        0
      );
      this.checkAndCreateList();
    }
  }

  private async checkAndCreateList() {
    this.helper = new SPHelper(
      this.properties.enableAttachments ? this.properties.docLib : undefined
    );
    await this.helper.checkListExists();
    this.initializeComments();
  }

  private initializeComments = async () => {
    this.context.statusRenderer.clearLoadingIndicator(this.domElement);
    this.domElement.innerHTML = `
      <div class="${styles.pageComments}">
        <div class="${styles.container}">
          <div class="${styles.row}">
            <div id="page-comments"></div>
          </div>
        </div>
      </div>`;

    const self = this;
    this.pageurl = this.context.pageContext.legacyPageContext.serverRequestPath;

    if (this.properties.enableAttachments) {
      await this.helper.getDocLibInfo();
      this.postAttachmentPath = await this.helper.getPostAttachmentFilePath(
        this.pageurl
      );
      this.pageFolderExists = await this.helper.checkForPageFolder(
        this.postAttachmentPath
      );
    }

    this.currentUserInfo = await this.helper.getCurrentUserInfo();
    console.log(this.currentUserInfo);
    this.siteUsers = await this.helper.getSiteUsers(self.currentUserInfo.ID);

    require(["jquery", "./js/jquery-comments.min"], (jQuery, comments) => {
      jQuery("#page-comments").comments({
        profilePictureURL: self.currentUserInfo.Picture,
        currentUserId: self.currentUserInfo.ID,
        currentUserIsAdmin: self.currentUserInfo.IsSiteAdmin,
        enableNavigation: self.properties.enableNavigation,
        enableReplying: self.properties.enableReplying,
        enableEditing: self.properties.enableEditing,
        enableUpvoting: self.properties.enableUpvoting,
        enableDeleting: self.properties.enableDeleting,
        enableAttachments: self.properties.enableAttachments,
        enableHashtags: self.properties.enableHashtags,
        enablePinging: self.properties.enablePinging,
        enableDocumentPreview: self.properties.enableDocumentPreview,
        roundProfilePictures: self.properties.roundProfilePictures,
        maxRepliesVisible: 3,
        textareaRows: 1,
        textareaRowsOnFocus: 2,
        textareaMaxRows: 5,
        highlightColor: "#079246",
        attachmentFileFormats:
          self.properties.attachmentFileFormats ||
          "audio/*,image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx",
        attachmentFileSize: self.properties.attachmentFileSize || 5,
        siteURL:
          self.context.pageContext.legacyPageContext.webServerRelativeUrl,

        timeFormatter: (time) => {
          try {
            return moment(time).format(
              self.properties.datetimeFormat || "DD/MM/YYYY  hh:mm:ss A"
            );
          } catch (err) {
            return moment(time).format("DD/MM/YYYY  hh:mm:ss A");
          }
        },

        getComments: async (success, error) => {
          try {
            const commentsArray = await self.helper.getPostComments(
              self.pageurl,
              self.currentUserInfo
            );
            commentsArray.forEach((comment) => {
              if (
                moment(comment.created).format("DD/MM/YYYY") ===
                moment().format("DD/MM/YYYY")
              ) {
                comment.is_new = true;
              }
              comment.created_by_current_user =
                comment.userid === self.currentUserInfo.ID;
            });
            success(commentsArray);
          } catch (err) {
            console.error("Error loading comments:", err);
            success([]);
          }
        },

        postComment: async (commentJson, success, error) => {
          commentJson.fullname = self.currentUserInfo.DisplayName;
          commentJson.userid = self.currentUserInfo.ID;
          commentJson = self.saveComment(commentJson);
          await self.helper.postComment(
            self.pageurl,
            commentJson,
            self.currentUserInfo
          );
          if (
            moment(commentJson.created).format("DD/MM/YYYY") ===
            moment().format("DD/MM/YYYY")
          ) {
            commentJson.is_new = true;
          }
          commentJson.created_by_current_user = true;
          success(commentJson);
        },

        putComment: async (commentJSON, success, error) => {
          console.log("Current user ROLE:", self.currentUserInfo);

          commentJSON = self.saveComment(commentJSON);

          commentJSON.userid = self.currentUserInfo.ID;
          commentJSON.fullname = self.currentUserInfo.DisplayName;

          const isOwner =
            parseInt(commentJSON.userid) === parseInt(self.currentUserInfo.ID);
          const isAdmin = self.currentUserInfo.IsSiteAdmin === true;

          if (!isOwner && !isAdmin) {
            console.warn("Edit denied: user is not the comment owner or admin");
            error("You are not allowed to edit this comment.");
            return;
          }

          const result = await self.helper.editComments(
            self.pageurl,
            commentJSON,
            self.currentUserInfo
          );

          if (result && typeof result === "object" && "error" in result) {
            error(result.error);
            return;
          }

          success(commentJSON);
        },
        deleteComment: async (commentJSON, success, error) => {
          console.log("Comment userid:", commentJSON.userid);
          console.log("Current user ID:", self.currentUserInfo.ID);

          commentJSON = self.saveComment(commentJSON);

          // ✅ Add missing fields
          commentJSON.userid = self.currentUserInfo.ID;
          commentJSON.fullname = self.currentUserInfo.DisplayName;
          console.log("Comment userid:", commentJSON.userid);
          try {
            const result = await self.helper.deleteComment(
              self.pageurl,
              commentJSON,
              self.currentUserInfo
            );
            if (
              typeof result === "object" &&
              result !== null &&
              "error" in result
            ) {
              error((result as any).error); // or just: error(result.error) with proper type cast
              return;
            } else success();
          } catch (err) {
            error(err);
          }
        },

        searchUsers: async (term, success) => {
          if (self.siteUsers.length <= 0) {
            self.siteUsers = await self.helper.getSiteUsers(
              self.currentUserInfo.ID
            );
          }
          const res = _.chain(self.siteUsers)
            .filter(
              (o) =>
                o.fullname.toLowerCase().includes(term.toLowerCase()) ||
                o.email.toLowerCase().includes(term.toLowerCase())
            )
            .take(10)
            .value();
          success(res);
        },

        upvoteComment: async (commentJSON, success, error) => {
          await self.helper.voteComment(
            self.pageurl,
            commentJSON,
            self.currentUserInfo
          );
          success(commentJSON);
        },

        uploadAttachments: async (commentArray, success) => {
          const res = await self.helper.postAttachments(
            commentArray,
            self.pageFolderExists,
            self.postAttachmentPath
          );
          Object.assign(res[0], {
            userid: self.currentUserInfo.ID,
            fullname: self.currentUserInfo.DisplayName,
          });
          await self.helper.postComment(
            self.pageurl,
            res[0],
            self.currentUserInfo
          );
          if (
            moment(res[0].created).format("DD/MM/YYYY") ===
            moment().format("DD/MM/YYYY")
          ) {
            res[0].is_new = true;
          }
          res[0].created_by_current_user = true;
          success(res);
        },

        editComment: () => {
          jQuery("#page-comments").comments("refresh");
        },
      });
    });
  };

  private saveComment = (data) => {
    Object.keys(data.pings).forEach((userId) => {
      const fullname = data.pings[userId];
      const pingText = `@${fullname}`;
      data.content = data.content.replace(
        new RegExp(`@${userId}`, "g"),
        pingText
      );
    });
    return data;
  };

  private checkForDocumentLibrary = (value: string): string => {
    if (
      !value ||
      value.trim().length === 0 ||
      value.toUpperCase() === "NO_LIST_SELECTED"
    ) {
      return strings.AttachmentRepoPropValMsg;
    }
    return "";
  };

  protected get disableReactivePropertyChanges(): boolean {
    return true;
  }

  protected get dataVersion(): Version {
    return Version.parse("1.0");
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description: strings.PropertyPaneDescription,
          },
          groups: [
            {
              groupName: strings.BasicGroupName,
              groupFields: [
                PropertyPaneTextField("datetimeFormat", {
                  label: strings.DateTimeFormatLabel,
                  description: strings.DateTimeFormatDescription,
                  multiline: false,
                  resizable: false,
                  value: this.properties.datetimeFormat,
                }),
                PropertyFieldToggleWithCallout("roundProfilePictures", {
                  calloutTrigger: CalloutTriggers.Hover,
                  key: "roundProfilePicturesFieldId",
                  label: strings.RoundProfilePicLabel,
                  calloutContent: React.createElement(
                    "p",
                    {},
                    strings.RoundProfilePicDescription
                  ),
                  onText: "Enable",
                  offText: "Disable",
                  checked:
                    this.properties.roundProfilePictures !== undefined
                      ? this.properties.roundProfilePictures
                      : true,
                }),
                PropertyFieldToggleWithCallout("enableNavigation", {
                  calloutTrigger: CalloutTriggers.Hover,
                  key: "enableNavigationFieldId",
                  label: strings.NavigationLabel,
                  calloutContent: React.createElement(
                    "p",
                    {},
                    strings.NavigationDescription
                  ),
                  onText: "Enable",
                  offText: "Disable",
                  checked:
                    this.properties.enableNavigation !== undefined
                      ? this.properties.enableNavigation
                      : true,
                }),
                PropertyFieldToggleWithCallout("enableAttachments", {
                  calloutTrigger: CalloutTriggers.Hover,
                  key: "enableAttachmentsFieldId",
                  label: strings.AttachmentLabel,
                  calloutContent: React.createElement(
                    "p",
                    {},
                    strings.AttachmentDescription
                  ),
                  onText: "Enable",
                  offText: "Disable",
                  checked:
                    this.properties.enableAttachments !== undefined
                      ? this.properties.enableAttachments
                      : false,
                }),
                PropertyFieldListPicker("docLib", {
                  label: strings.AttachmentRepoLabel,
                  selectedList: this.properties.docLib,
                  includeHidden: false,
                  orderBy: PropertyFieldListPickerOrderBy.Title,
                  onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
                  properties: this.properties,
                  context: this.context as any,
                  onGetErrorMessage: this.checkForDocumentLibrary.bind(this),
                  deferredValidationTime: 0,
                  key: "docLibFieldId",
                  baseTemplate: 101,
                  disabled: !this.properties.enableAttachments,
                }),
                PropertyPaneTextField("attachmentFileFormats", {
                  label: strings.AttachmentFileFormatLabel,
                  description: strings.AttachmentFileFormatDescription,
                  multiline: false,
                  resizable: false,
                  value: this.properties.attachmentFileFormats,
                  disabled: !this.properties.enableAttachments,
                }),
                PropertyFieldSliderWithCallout("attachmentFileSize", {
                  calloutContent: React.createElement(
                    "div",
                    {},
                    strings.AttachmentFileSizeDescription
                  ),
                  calloutTrigger: CalloutTriggers.Hover,
                  calloutWidth: 200,
                  key: "attachmentFileSizeFieldId",
                  label: strings.AttachmentFileSizeLabel,
                  max: 10,
                  min: 1,
                  step: 1,
                  showValue: true,
                  value: this.properties.attachmentFileSize,
                  disabled: !this.properties.enableAttachments,
                }),
                PropertyFieldToggleWithCallout("enablePinging", {
                  calloutTrigger: CalloutTriggers.Hover,
                  key: "enablePingingFieldId",
                  label: strings.PingLabel,
                  calloutContent: React.createElement(
                    "p",
                    {},
                    strings.PingDescription
                  ),
                  onText: "Enable",
                  offText: "Disable",
                  checked:
                    this.properties.enablePinging !== undefined
                      ? this.properties.enablePinging
                      : false,
                }),
                PropertyFieldToggleWithCallout("enableEditing", {
                  calloutTrigger: CalloutTriggers.Hover,
                  key: "enableEditingFieldId",
                  label: strings.EditingLabel,
                  calloutContent: React.createElement(
                    "p",
                    {},
                    strings.EditingDescription
                  ),
                  onText: "Enable",
                  offText: "Disable",
                  checked:
                    this.properties.enableEditing !== undefined
                      ? this.properties.enableEditing
                      : false,
                }),
                PropertyFieldToggleWithCallout("enableDeleting", {
                  calloutTrigger: CalloutTriggers.Hover,
                  key: "enableDeletingFieldId",
                  label: strings.DeleteLabel,
                  calloutContent: React.createElement(
                    "p",
                    {},
                    strings.DeleteDescription
                  ),
                  onText: "Enable",
                  offText: "Disable",
                  checked:
                    this.properties.enableDeleting !== undefined
                      ? this.properties.enableDeleting
                      : false,
                  disabled: !this.properties.enableEditing,
                }),
                PropertyFieldToggleWithCallout(
                  "enableDeletingCommentWithReplies",
                  {
                    calloutTrigger: CalloutTriggers.Hover,
                    key: "enableDeletingCommentWithRepliesFieldId",
                    label: strings.DeleteRepliesLabel,
                    calloutContent: React.createElement(
                      "p",
                      {},
                      strings.DeleteRepliesDescription
                    ),
                    onText: "Enable",
                    offText: "Disable",
                    checked: this.properties.enableDeletingCommentWithReplies,
                    disabled: !this.properties.enableEditing,
                  }
                ),
                PropertyFieldToggleWithCallout("enableUpvoting", {
                  calloutTrigger: CalloutTriggers.Hover,
                  key: "enableUpvotingFieldId",
                  label: strings.UpVotingLabel,
                  calloutContent: React.createElement(
                    "p",
                    {},
                    strings.UpVotingDescription
                  ),
                  onText: "Enable",
                  offText: "Disable",
                  checked:
                    this.properties.enableUpvoting !== undefined
                      ? this.properties.enableUpvoting
                      : true,
                }),
                PropertyFieldToggleWithCallout("enableReplying", {
                  calloutTrigger: CalloutTriggers.Hover,
                  key: "enableReplyingFieldId",
                  label: strings.ReplyLabel,
                  calloutContent: React.createElement(
                    "p",
                    {},
                    strings.ReplyDescription
                  ),
                  onText: "Enable",
                  offText: "Disable",
                  checked:
                    this.properties.enableReplying !== undefined
                      ? this.properties.enableReplying
                      : true,
                }),
                PropertyFieldToggleWithCallout("enableHashtags", {
                  calloutTrigger: CalloutTriggers.Hover,
                  key: "enableHashtagsFieldId",
                  label: strings.HashtagsLabel,
                  calloutContent: React.createElement(
                    "p",
                    {},
                    strings.HashtagsDescription
                  ),
                  onText: "Enable",
                  offText: "Disable",
                  checked:
                    this.properties.enableHashtags !== undefined
                      ? this.properties.enableHashtags
                      : false,
                }),
                PropertyFieldToggleWithCallout("enableDocumentPreview", {
                  calloutTrigger: CalloutTriggers.Hover,
                  key: "enableDocumentPreviewFieldId",
                  label: strings.DocumentPreviewLabel,
                  calloutContent: React.createElement(
                    "p",
                    {},
                    strings.DocumentPreviewDescription
                  ),
                  onText: "Enable",
                  offText: "Disable",
                  checked:
                    this.properties.enableDocumentPreview !== undefined
                      ? this.properties.enableDocumentPreview
                      : false,
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
