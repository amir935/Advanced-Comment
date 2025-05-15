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
require("textcomplete");
import { sp } from "@pnp/sp";
import SPHelper from "./SPHelper";

require("./css/jquery-comments.css");

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
  private isCommentAdmin: boolean = false;
  private helper: SPHelper = null;
  private currentUserInfo: any = null;
  private siteUsers: any[] = [];
  private pageurl: string = "";
  private postAttachmentPath: string = "";
  private pageFolderExists: boolean = false;

  protected async onInit(): Promise<void> {
    await super.onInit();
    sp.setup({ spfxContext: this.context as any });
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
        <div class="${styles.errorMessage}">
          <i class="fa fa-times-circle"></i>&nbsp;${strings.NoAttachmentRepoMsg}
        </div>`;
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

    this.pageurl = this.context.pageContext.legacyPageContext.serverRequestPath;

    // 1) fetch current user
    this.currentUserInfo = await this.helper.getCurrentUserInfo();
    // 2) check Comment Administrators membership
    this.isCommentAdmin = await this.helper.isUserInGroup(
      "comment Administer",
      this.currentUserInfo.ID
    );
    // 3) preload @-mention users
    this.siteUsers = await this.helper.getSiteUsers(this.currentUserInfo.ID);

    if (this.properties.enableAttachments) {
      await this.helper.getDocLibInfo();
      this.postAttachmentPath = await this.helper.getPostAttachmentFilePath(
        this.pageurl
      );
      this.pageFolderExists = await this.helper.checkForPageFolder(
        this.postAttachmentPath
      );
    }

    const self = this;
    require(["jquery", "./js/jquery-comments.min"], (jQuery, comments) => {
      const currentUserId = Number(self.currentUserInfo.ID);
      const currentUserIsAdmin =
        self.currentUserInfo.IsSiteAdmin || self.isCommentAdmin;

      jQuery("#page-comments").comments({
        fieldMappings: {
          profilePictureURL: "profile_picture_url",
        },
        profilePictureURL: self.currentUserInfo.Picture,
        currentUserId,
        currentUserIsAdmin,
        enableEditing: self.properties.enableEditing,
        enableNavigation: self.properties.enableNavigation,
        enableReplying: self.properties.enableReplying,
        enableDeleting: self.properties.enableDeleting,
        enableDeletingCommentWithReplies:
          self.properties.enableDeletingCommentWithReplies,
        enableUpvoting: self.properties.enableUpvoting,
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
              self.properties.datetimeFormat || "DD/MM/YYYY hh:mm:ss A"
            );
          } catch {
            return moment(time).format("DD/MM/YYYY hh:mm:ss A");
          }
        },

        // getComments: async (success, error) => {
        //   try {
        //     const commentsArray = await self.helper.getPostComments(
        //       self.pageurl,
        //       self.currentUserInfo
        //     );
        //     commentsArray.forEach((comment) => {
        //       // mark new
        //       if (
        //         moment(comment.created).format("DD/MM/YYYY") ===
        //         moment().format("DD/MM/YYYY")
        //       ) {
        //         comment.is_new = true;
        //       }
        //       // only authors or Comment-Admins can edit
        //       const isOwner = comment.userid === self.currentUserInfo.ID;
        //       comment.created_by_current_user = isOwner;
        //     });
        //     success(commentsArray);
        //   } catch (e) {
        //     console.error("Error loading comments:", e);
        //     success([]);
        //   }
        // },
        getComments: async (success, error) => {
          try {
            const commentsArray = await self.helper.getPostComments(
              self.pageurl,
              self.currentUserInfo
            );

            commentsArray.forEach((comment) => {
              const rawUsername =
                comment.email ||
                comment.UserPrincipalName ||
                comment.fullname ||
                "";
              comment.profilePictureURL = `${
                self.context.pageContext.web.absoluteUrl
              }/_layouts/15/userphoto.aspx?size=S&username=${encodeURIComponent(
                rawUsername
              )}`; //comment.profile_picture_url;
              console.log(comment.profilePictureURL);

              if (
                moment(comment.created).format("DD/MM/YYYY") ===
                moment().format("DD/MM/YYYY")
              ) {
                comment.is_new = true;
              }

              // ✅ Mark if this is the current user's comment
              const isOwner = comment.userid === self.currentUserInfo.ID;
              comment.created_by_current_user = isOwner;
              console.log(comment.profilePictureURL);
            });
            console.log("🧪 Final comment objects:", commentsArray);
            console.log("🔍 sample comment:", commentsArray[0]);
            success(commentsArray);
          } catch (e) {
            console.error("Error loading comments:", e);
            success([]);
          }
        },

        postComment: async (commentJson, success) => {
          commentJson.fullname = self.currentUserInfo.DisplayName;
          commentJson.userid = self.currentUserInfo.ID;
          commentJson = self.saveComment(commentJson);
          await self.helper.postComment(
            self.pageurl,
            commentJson,
            self.currentUserInfo
          );
          commentJson.is_new =
            moment(commentJson.created).format("DD/MM/YYYY") ===
            moment().format("DD/MM/YYYY");
          commentJson.created_by_current_user = true;
          success(commentJson);
        },

        putComment: async (commentJSON, success, error) => {
          commentJSON = self.saveComment(commentJSON);
          commentJSON.userid = self.currentUserInfo.ID;
          commentJSON.fullname = self.currentUserInfo.DisplayName;
          try {
            const result = await self.helper.editComments(
              self.pageurl,
              commentJSON,
              self.currentUserInfo
            );
            if (result && typeof result === "object" && "error" in result) {
              return error(result.error as string);
            }
            success(commentJSON);
          } catch (e) {
            console.error("Error editing comment:", e);
            error("An error occurred while editing your comment.");
          }
        },

        deleteComment: async (commentJSON, success, error) => {
          commentJSON = self.saveComment(commentJSON);
          commentJSON.userid = self.currentUserInfo.ID;
          commentJSON.fullname = self.currentUserInfo.DisplayName;
          try {
            const result = await self.helper.deleteComment(
              self.pageurl,
              commentJSON,
              self.currentUserInfo
            );
            if (result && typeof result === "object" && "error" in result) {
              return error((result as any).error);
            }
            success();
          } catch (e) {
            error(e);
          }
        },

        upvoteComment: async (commentJSON, success) => {
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
          res[0].is_new =
            moment(res[0].created).format("DD/MM/YYYY") ===
            moment().format("DD/MM/YYYY");
          res[0].created_by_current_user = true;
          success(res);
        },

        editComment: () => {
          jQuery("#page-comments").comments("refresh");
        },

        searchUsers: async (term, success) => {
          if (self.siteUsers.length === 0) {
            self.siteUsers = await self.helper.getSiteUsers(
              self.currentUserInfo.ID
            );
          }
          const matches = _.chain(self.siteUsers)
            .filter(
              (u) =>
                u.fullname.toLowerCase().includes(term.toLowerCase()) ||
                u.email.toLowerCase().includes(term.toLowerCase())
            )
            .take(10)
            .value();
          success(matches);
        },
      });
    });
  };

  private saveComment = (data) => {
    Object.keys(data.pings).forEach((userId) => {
      data.content = data.content.replace(
        new RegExp(`@${userId}`, "g"),
        `@${data.pings[userId]}`
      );
    });
    return data;
  };

  private checkForDocumentLibrary = (value: string): string =>
    !value || value.trim() === "" || value.toUpperCase() === "NO_LIST_SELECTED"
      ? strings.AttachmentRepoPropValMsg
      : "";

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
          header: { description: strings.PropertyPaneDescription },
          groups: [
            {
              groupName: strings.BasicGroupName,
              groupFields: [
                PropertyPaneTextField("datetimeFormat", {
                  label: strings.DateTimeFormatLabel,
                  description: strings.DateTimeFormatDescription,
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
                  checked: this.properties.roundProfilePictures ?? true,
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
